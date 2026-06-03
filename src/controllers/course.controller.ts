import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import LessonProgress from '../models/LessonProgress.js';
import Lesson from '../models/Lesson.js';
import Rating from '../models/Rating.js';
import Transaction from '../models/Transaction.js';
import { IUser } from '../models/User.js';
import { sanitizeHtml } from '../middlewares/sanitize.js';

export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, level, search, limit = 20, offset = 0 } = req.query;
    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: search, $options: 'i' };
    const courses = await Course.find(filter)
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('instructorId', 'firstName lastName');
    const total = await Course.countDocuments(filter);
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

export const getUserEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const enrollments = await Enrollment.find({ userId: user._id })
      .populate({
        path: 'courseId',
        select: 'title thumbnail totalLessons price rating level instructorId'
      })
      .lean();
    const formatted = enrollments.map(enrollment => ({
      _id: enrollment._id,
      userId: enrollment.userId,
      course: enrollment.courseId,
      progress: enrollment.progress || 0,
      status: enrollment.status,
      startedAt: enrollment.startedAt,
      completedAt: enrollment.completedAt,
      courseId: enrollment.courseId?._id || enrollment.courseId
    }));
    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

export const enrollCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      console.error('[ENROLL] Unauthenticated attempt. Headers:', req.headers.authorization);
      return res.status(401).json({ success: false, message: 'You must be logged in to enroll' });
    }
    const course = await Course.findById(req.params.id);
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not available' });
    }
    const existing = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    if (course.price > 0) {
      return res.json({ success: true, requirePayment: true, price: course.salePrice || course.price });
    }
    await Enrollment.create({ userId: user._id, courseId: course._id });
    course.totalStudents += 1;
    await course.save();
    const newEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id })
      .populate('courseId', 'title thumbnail totalLessons price rating level');
    res.json({
      success: true,
      message: 'Enrolled successfully',
      data: {
        _id: newEnrollment?._id,
        course: newEnrollment?.courseId,
        progress: 0,
        status: 'active'
      }
    });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.userId && err.keyPattern?.courseId) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    next(err);
  }
};

export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId } = req.params;
    const { completed, timeSpent } = req.body;
    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: req.params.id });
    if (!enrollment) return res.status(400).json({ success: false, message: 'Not enrolled' });

    let progress = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId });
    if (!progress) {
      progress = new LessonProgress({
        enrollmentId: enrollment._id,
        lessonId,
        completed,
        timeSpent: timeSpent || 0,
      });
    } else {
      if (completed) progress.completed = true;
      progress.timeSpent += timeSpent || 0;
    }

    // Time‑sensitive XP – require at least 80% of lesson duration
    if (completed && !progress.completed) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        const durationMinutes = lesson.duration || 0;
        const requiredMinutes = durationMinutes * 0.8;
        const timeSpentMinutes = (progress.timeSpent || 0) / 60;
        if (timeSpentMinutes >= requiredMinutes) {
          user.xp = (user.xp || 0) + (lesson.xpReward || 50);
          await user.save();
        } else {
          return res.status(400).json({
            success: false,
            message: `You need to spend at least ${Math.ceil(requiredMinutes)} minutes on this lesson to earn XP.`
          });
        }
      }
    }

    await progress.save();

    const totalLessons = await Lesson.countDocuments({ courseId: enrollment.courseId });
    const completedLessons = await LessonProgress.countDocuments({ enrollmentId: enrollment._id, completed: true });
    enrollment.progress = Math.round((completedLessons / totalLessons) * 100);
    if (enrollment.progress === 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      user.walletBalance = (user.walletBalance || 0) + 100;
      await user.save();
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: 100,
        status: 'completed',
        description: 'Course completion bonus',
      });
    }
    await enrollment.save();
    res.json({ success: true, data: { progress: enrollment.progress } });
  } catch (err) {
    next(err);
  }
};

export const rateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { rating, review } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    if (!enrollment || enrollment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Complete the course to rate' });
    }
    const existing = await Rating.findOne({ userId: user._id, courseId: course._id });
    if (existing) {
      existing.rating = rating;
      existing.review = review;
      await existing.save();
    } else {
      await Rating.create({ userId: user._id, courseId: course._id, rating, review });
    }
    const ratings = await Rating.find({ courseId: course._id });
    const avg = ratings.reduce((acc, r) => acc + r.rating, 0) / ratings.length;
    course.avgRating = avg;
    await course.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
