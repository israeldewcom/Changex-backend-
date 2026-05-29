import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import LessonProgress from '../models/LessonProgress.js';
import Lesson from '../models/Lesson.js';
import Rating from '../models/Rating.js';
import Notification from '../models/Notification.js';
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
    const course = await Course.findById(req.params.id).populate('instructorId', 'firstName lastName bio').lean();
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    const lessons = await Lesson.find({ courseId: course._id }).sort('order');
    const ratings = await Rating.find({ courseId: course._id }).populate('userId', 'firstName lastName');

    res.json({ success: true, data: { ...course, lessons, ratings } });
  } catch (err) {
    next(err);
  }
};

export const enrollCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findById(req.params.id);
    if (!course || !course.isPublished) {
      res.status(404).json({ success: false, message: 'Course not available' });
      return;
    }

    const existing = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    if (existing) {
      res.status(400).json({ success: false, message: 'Already enrolled' });
      return;
    }

    if (course.price > 0) {
      res.json({ success: true, requirePayment: true, price: course.salePrice || course.price });
      return;
    }

    await Enrollment.create({ userId: user._id, courseId: course._id });
    course.totalStudents += 1;
    await course.save();

    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (err) {
    next(err);
  }
};

export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId } = req.params;
    const { completed, timeSpent } = req.body;

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: req.params.id });
    if (!enrollment) {
      res.status(400).json({ success: false, message: 'Not enrolled' });
      return;
    }

    let progress = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId });
    if (!progress) {
      progress = new LessonProgress({ enrollmentId: enrollment._id, lessonId, completed, timeSpent: timeSpent || 0 });
    } else {
      if (completed) progress.completed = true;
      progress.timeSpent += timeSpent || 0;
    }

    if (completed && !progress.completed) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        user.xp += lesson.xpReward;
        await user.save();
      }
    }

    await progress.save();

    const totalLessons = await Lesson.countDocuments({ courseId: enrollment.courseId });
    const completedLessons = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      completed: true,
    });
    enrollment.progress = Math.round((completedLessons / totalLessons) * 100);
    if (enrollment.progress === 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      
      // ✅ ADD COURSE COMPLETION BONUS (₦100)
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
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    if (!enrollment || enrollment.status !== 'completed') {
      res.status(400).json({ success: false, message: 'Complete the course to rate' });
      return;
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
