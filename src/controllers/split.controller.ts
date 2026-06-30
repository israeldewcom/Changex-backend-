// ============================================================
// FILE: src/controllers/split.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import RevenueSplit from '../models/RevenueSplit.js';
import Course from '../models/Course.js';

export const createSplit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId, instructorId, percentage } = req.body;

    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found or not owner' });

    const total = await RevenueSplit.aggregate([
      { $match: { courseId } },
      { $group: { _id: null, total: { $sum: '$percentage' } } },
    ]);
    const used = total[0]?.total || 0;
    if (used + percentage > 100) {
      return res.status(400).json({ success: false, message: 'Total split exceeds 100%' });
    }

    const split = await RevenueSplit.create({
      courseId,
      instructorId,
      percentage,
    });

    res.status(201).json({ success: true, data: split });
  } catch (err) {
    next(err);
  }
};

export const getSplits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.query;

    const filter: any = {};
    if (courseId) filter.courseId = courseId;

    const splits = await RevenueSplit.find(filter)
      .populate('instructorId', 'firstName lastName email')
      .populate('courseId', 'title');

    res.json({ success: true, data: splits });
  } catch (err) {
    next(err);
  }
};

export const updateSplit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { percentage } = req.body;

    const split = await RevenueSplit.findById(id);
    if (!split) return res.status(404).json({ success: false, message: 'Split not found' });

    const course = await Course.findOne({ _id: split.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    const total = await RevenueSplit.aggregate([
      { $match: { courseId: split.courseId, _id: { $ne: id } } },
      { $group: { _id: null, total: { $sum: '$percentage' } } },
    ]);
    const used = total[0]?.total || 0;
    if (used + percentage > 100) {
      return res.status(400).json({ success: false, message: 'Total split exceeds 100%' });
    }

    split.percentage = percentage;
    await split.save();

    res.json({ success: true, data: split });
  } catch (err) {
    next(err);
  }
};

export const deleteSplit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;

    const split = await RevenueSplit.findById(id);
    if (!split) return res.status(404).json({ success: false, message: 'Split not found' });

    const course = await Course.findOne({ _id: split.courseId, instructorId: user._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    await split.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
