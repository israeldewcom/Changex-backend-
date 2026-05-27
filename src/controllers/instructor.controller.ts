// File: src/controllers/instructor.controller.ts
import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import CourseAnalytics from '../models/CourseAnalytics.js';

export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await Course.find({ instructorId: req.user!._id }).lean();
    const courseIds = courses.map(c => c._id);
    const totalStudents = await Enrollment.countDocuments({ courseId: { $in: courseIds } });
    const revenue = courses.reduce((acc, c) => acc + c.price * (c.totalStudents || 0), 0); // simplified

    res.json({ success: true, data: { courses, totalStudents, revenue } });
  } catch (err) {
    next(err);
  }
};

export const getCourseAnalytics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: req.user!._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const analytics = await CourseAnalytics.find({ courseId }).sort({ period: -1 }).limit(12);
    res.json({ success: true, data: analytics });
  } catch (err) {
    next(err);
  }
};

export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courseData = {
      ...req.body,
      instructorId: req.user!._id,
      description: sanitizeHtml(req.body.description),
    };
    const course = await Course.create(courseData);
    res.status(201).json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, instructorId: req.user!._id },
      { ...req.body, description: sanitizeHtml(req.body.description || '') },
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, instructorId: req.user!._id },
      { approvalStatus: 'pending' },
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, message: 'Submitted for review' });
  } catch (err) {
    next(err);
  }
};

export const uploadCourseMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await uploadToCloudinary(req.file.path, 'courses');
    res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) {
    next(err);
  }
};

export const createLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: req.user!._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lessonData = { ...req.body, courseId: course._id };
    const lesson = await Lesson.create(lessonData);
    course.totalLessons += 1;
    await course.save();
    res.status(201).json({ success: true, data: lesson });
  } catch (err) {
    next(err);
  }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    const course = await Course.findOne({ _id: lesson.courseId, instructorId: req.user!._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    Object.assign(lesson, req.body);
    await lesson.save();
    res.json({ success: true, data: lesson });
  } catch (err) {
    next(err);
  }
};

export const deleteLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lesson = await Lesson.findById(req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    const course = await Course.findOne({ _id: lesson.courseId, instructorId: req.user!._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    await Lesson.findByIdAndDelete(req.params.lessonId);
    course.totalLessons -= 1;
    await course.save();
    res.json({ success: true, message: 'Lesson deleted' });
  } catch (err) {
    next(err);
  }
};

export const reorderLessons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.params;
    const { orderedIds } = req.body; // array of lesson IDs in new order
    const course = await Course.findOne({ _id: courseId, instructorId: req.user!._id });
    if (!course) return res.status(403).json({ success: false, message: 'Not authorized' });

    const bulkOps = orderedIds.map((id: string, index: number) => ({
      updateOne: {
        filter: { _id: id, courseId },
        update: { order: index + 1 },
      },
    }));
    await Lesson.bulkWrite(bulkOps);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
