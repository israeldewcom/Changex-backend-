import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import { IUser } from '../models/User.js';
import { sanitizeHtml } from '../middlewares/sanitize.js';

export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courses = await Course.find({ instructorId: user._id }).lean();
    const courseIds = courses.map(c => c._id);
    const totalStudents = await Enrollment.countDocuments({ courseId: { $in: courseIds } });
    const revenue = courses.reduce((acc, c) => acc + (c.price || 0) * (c.totalStudents || 0), 0);

    res.json({ success: true, data: { courses, totalStudents, revenue } });
  } catch (err) {
    next(err);
  }
};

export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courseData = {
      ...req.body,
      instructorId: user._id,
      description: sanitizeHtml(req.body.description || ''),
    };
    const course = await Course.create(courseData);
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, instructorId: user._id },
      { ...req.body, description: sanitizeHtml(req.body.description || '') },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, instructorId: user._id },
      { approvalStatus: 'pending' },
      { new: true }
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, message: 'Submitted for review' });
  } catch (err) {
    next(err);
  }
};

export const createLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const lesson = await Lesson.create({ ...req.body, courseId: course._id });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: 1 } });
    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    next(err);
  }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const lesson = await Lesson.findOneAndUpdate(
      { _id: req.params.lessonId, courseId: course._id },
      req.body,
      { new: true }
    );
    if (!lesson) {
      res.status(404).json({ success: false, message: 'Lesson not found' });
      return;
    }
    res.json({ success: true, data: lesson });
  } catch (err) {
    next(err);
  }
};

export const deleteLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const lesson = await Lesson.findOneAndDelete({ _id: req.params.lessonId, courseId: course._id });
    if (!lesson) {
      res.status(404).json({ success: false, message: 'Lesson not found' });
      return;
    }
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: -1 } });
    res.json({ success: true, message: 'Lesson deleted' });
  } catch (err) {
    next(err);
  }
};
