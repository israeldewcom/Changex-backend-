// ============================================================
// FILE: src/controllers/analytics.controller.ts (NEW)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import LessonProgress from '../models/LessonProgress.js';
import Course from '../models/Course.js';
import Transaction from '../models/Transaction.js';
import Lesson from '../models/Lesson.js';

export const getCourseAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const totalEnrollments = await Enrollment.countDocuments({ courseId });
    const completed = await Enrollment.countDocuments({ courseId, status: 'completed' });
    const active = await Enrollment.countDocuments({ courseId, status: 'active' });
    const dropped = await Enrollment.countDocuments({ courseId, status: 'dropped' });

    const totalLessons = await Lesson.countDocuments({ courseId });
    const progressData = await LessonProgress.aggregate([
      { $match: { enrollmentId: { $in: (await Enrollment.find({ courseId }).select('_id')).map(e => e._id) } } },
      { $group: { _id: '$enrollmentId', completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
    ]);

    const avgProgress = progressData.length
      ? progressData.reduce((acc, p) => acc + (p.completed / totalLessons) * 100, 0) / progressData.length
      : 0;

    const revenue = await Transaction.aggregate([
      { $match: { 'metadata.courseId': courseId, type: 'course_purchase', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: {
        courseId,
        totalEnrollments,
        completed,
        active,
        dropped,
        completionRate: totalEnrollments ? (completed / totalEnrollments) * 100 : 0,
        averageProgress: avgProgress,
        totalRevenue: revenue[0]?.total || 0,
        totalLessons,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getRevenueAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { period = 'monthly' } = req.query;

    const courses = await Course.find({ instructorId: user._id }).select('_id');
    const courseIds = courses.map(c => c._id);

    const revenue = await Transaction.aggregate([
      {
        $match: {
          'metadata.courseId': { $in: courseIds },
          type: 'course_purchase',
          status: 'completed',
        },
      },
      {
        $group: {
          _id: period === 'monthly'
            ? { month: { $month: '$createdAt' }, year: { $year: '$createdAt' } }
            : { day: { $dayOfMonth: '$createdAt' }, month: { $month: '$createdAt' }, year: { $year: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json({ success: true, data: revenue });
  } catch (err) {
    next(err);
  }
};

export const getStudentAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    const courses = await Course.find({ instructorId: user._id }).select('_id');
    const courseIds = courses.map(c => c._id);

    const totalStudents = await Enrollment.distinct('userId', { courseId: { $in: courseIds } });
    const activeStudents = await Enrollment.distinct('userId', {
      courseId: { $in: courseIds },
      status: 'active',
    });
    const completedStudents = await Enrollment.distinct('userId', {
      courseId: { $in: courseIds },
      status: 'completed',
    });

    const retention = await Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: '$userId',
          progress: { $max: '$progress' },
        },
      },
      {
        $bucket: {
          groupBy: '$progress',
          boundaries: [0, 25, 50, 75, 100],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        totalStudents: totalStudents.length,
        activeStudents: activeStudents.length,
        completedStudents: completedStudents.length,
        retentionBuckets: retention,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getEngagementAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    const courses = await Course.find({ instructorId: user._id }).select('_id');
    const courseIds = courses.map(c => c._id);

    const enrollments = await Enrollment.find({ courseId: { $in: courseIds } }).select('_id');
    const enrollmentIds = enrollments.map(e => e._id);

    const recentActivity = await LessonProgress.find({
      enrollmentId: { $in: enrollmentIds },
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }).countDocuments();

    res.json({
      success: true,
      data: {
        weeklyActiveStudents: recentActivity,
        totalEnrollments: enrollmentIds.length,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getFunnelAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lessons = await Lesson.find({ courseId }).sort('order');
    const totalLessons = lessons.length;

    const funnel = [];
    for (let i = 0; i < totalLessons; i++) {
      const completedCount = await LessonProgress.countDocuments({
        enrollmentId: { $in: (await Enrollment.find({ courseId }).select('_id')).map(e => e._id) },
        lessonId: lessons[i]._id,
        completed: true,
      });
      const percentage = course.totalStudents ? (completedCount / course.totalStudents) * 100 : 0;
      funnel.push({
        lesson: lessons[i].title,
        lessonId: lessons[i]._id,
        completed: completedCount,
        percentage,
      });
    }

    res.json({ success: true, data: funnel });
  } catch (err) {
    next(err);
  }
};
