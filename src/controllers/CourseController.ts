// File: src/controllers/course.controller.ts
import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import LessonProgress from '../models/LessonProgress.js';
import Lesson from '../models/Lesson.js';
import Rating from '../models/Rating.js';
import Notification from '../models/Notification.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { getIO } from '../socket.js';
import certificateQueue from '../workers/certificate.worker.js';

export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, level, search, limit = 20, offset = 0 } = req.query;
    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .skip(Number(offset))
        .limit(Number(limit))
        .populate('instructorId', 'firstName lastName')
        .lean(),
      Course.countDocuments(filter),
    ]);

    res.json({ success: true, data: courses, meta: { total } });
  } catch (err) {
    next(err);
  }
};

export const getCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructorId', 'firstName lastName bio')
      .lean();
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lessons = await Lesson.find({ courseId: course._id }).sort('order');
    const ratings = await Rating.find({ courseId: course._id }).populate('userId', 'firstName lastName');

    res.json({ success: true, data: { ...course, lessons, ratings } });
  } catch (err) {
    next(err);
  }
};

export const enrollCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course || !course.isPublished) return res.status(404).json({ success: false, message: 'Course not available' });

    const existing = await Enrollment.findOne({ userId: req.user!._id, courseId: course._id });
    if (existing) return res.status(400).json({ success: false, message: 'Already enrolled' });

    if (course.price > 0) {
      // Redirect to payment
      return res.json({ success: true, requirePayment: true, price: course.salePrice || course.price });
    }

    // Free enrollment
    await Enrollment.create({ userId: req.user!._id, courseId: course._id });
    course.totalStudents += 1;
    await course.save();

    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (err) {
    next(err);
  }
};

export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lessonId } = req.params;
    const { completed, timeSpent } = req.body;

    const enrollment = await Enrollment.findOne({ userId: req.user!._id, courseId: req.params.id });
    if (!enrollment) return res.status(400).json({ success: false, message: 'Not enrolled' });

    let progress = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId });
    if (!progress) {
      progress = new LessonProgress({ enrollmentId: enrollment._id, lessonId, completed, timeSpent: timeSpent || 0 });
    } else {
      if (completed) progress.completed = true;
      progress.timeSpent += timeSpent || 0;
      progress.lastAccessed = new Date();
    }

    if (completed && !progress.completed) {
      // Award XP if not already awarded
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        req.user!.xp += lesson.xpReward;
        await req.user!.save();
      }
    }

    await progress.save();

    // Recalculate course progress
    const totalLessons = await Lesson.countDocuments({ courseId: enrollment.courseId });
    const completedLessons = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      completed: true,
    });
    enrollment.progress = Math.round((completedLessons / totalLessons) * 100);
    if (enrollment.progress === 100) {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
    }
    await enrollment.save();

    // Check and award badges
    if (enrollment.status === 'completed') {
      // Award course completion badge (first course)
      const completedCourses = await Enrollment.countDocuments({ userId: req.user!._id, status: 'completed' });
      if (completedCourses === 1) {
        const badge = await Badge.findOne({ name: 'First Course Completed' });
        if (badge) {
          await UserBadge.findOneAndUpdate(
            { userId: req.user!._id, badgeId: badge._id },
            {},
            { upsert: true, new: true }
          );
        }
      }
      // Queue certificate generation
      certificateQueue.add({
        userId: req.user!._id,
        courseId: enrollment.courseId,
        userName: `${req.user!.firstName} ${req.user!.lastName}`,
        courseTitle: (await Course.findById(enrollment.courseId))?.title,
        completionDate: new Date(),
      });
    }

    res.json({ success: true, data: { progress: enrollment.progress } });
  } catch (err) {
    next(err);
  }
};

export const rateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rating, review } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const enrollment = await Enrollment.findOne({ userId: req.user!._id, courseId: course._id });
    if (!enrollment || enrollment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Complete the course to rate' });
    }

    const existing = await Rating.findOne({ userId: req.user!._id, courseId: course._id });
    if (existing) {
      existing.rating = rating;
      existing.review = review;
      await existing.save();
    } else {
      await Rating.create({ userId: req.user!._id, courseId: course._id, rating, review });
    }

    // Update average
    const ratings = await Rating.find({ courseId: course._id });
    const avg = ratings.reduce((acc, r) => acc + r.rating, 0) / ratings.length;
    course.avgRating = avg;
    await course.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
