// ============================================================
// FILE: src/controllers/offline.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import OfflineSync from '../models/OfflineSync.js';
import OfflineProgress from '../models/OfflineProgress.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';

// ─── SYNC OFFLINE PROGRESS ──────────────────────────────────────────
export const syncOffline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { data } = req.body; // Array of offline progress updates

    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'Data must be an array' });
    }

    const results = [];
    for (const item of data) {
      const { courseId, lessonId, progress, completed } = item;
      // Validate lesson exists
      const lesson = await Lesson.findById(lessonId);
      if (!lesson) continue;

      // Check enrollment
      const enrollment = await Enrollment.findOne({ userId: user._id, courseId });
      if (!enrollment) continue;

      // Update or create offline progress
      const offline = await OfflineProgress.findOneAndUpdate(
        { userId: user._id, courseId, lessonId },
        { progress, completed, lastUpdated: new Date() },
        { upsert: true, new: true }
      );
      results.push(offline);

      // Also update the real enrollment progress? Maybe sync later.
    }

    // Record sync
    await OfflineSync.create({
      userId: user._id,
      syncData: data,
      status: 'synced',
      syncedAt: new Date(),
    });

    res.json({
      success: true,
      message: `Synced ${results.length} items`,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET OFFLINE PROGRESS ───────────────────────────────────────────
export const getOfflineProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const progress = await OfflineProgress.find({ userId: user._id }).sort('-lastUpdated');
    res.json({ success: true, data: progress });
  } catch (err) {
    next(err);
  }
};

// ─── GET DOWNLOADABLE LESSONS ──────────────────────────────────────
export const getDownloadableLessons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const enrollments = await Enrollment.find({ userId: user._id }).select('courseId');
    const courseIds = enrollments.map(e => e.courseId);
    const lessons = await Lesson.find({
      courseId: { $in: courseIds },
      downloadable: true,
    }).select('title videoUrl downloadableUrl');
    res.json({ success: true, data: lessons });
  } catch (err) {
    next(err);
  }
};

// ─── SAVE OFFLINE DATA ──────────────────────────────────────────────
export const saveOfflineData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Key is required' });
    }
    // Store offline data in a generic way (could use a separate collection)
    // For now, we'll use a map on user or store in OfflineSync with type 'data'
    await OfflineSync.create({
      userId: user._id,
      syncData: { key, value },
      status: 'pending',
    });
    res.json({ success: true, message: 'Data saved offline' });
  } catch (err) {
    next(err);
  }
};
