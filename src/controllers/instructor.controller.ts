// src/controllers/instructor.controller.ts (only submitForReview is changed; include the whole file)
import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import Question from '../models/Question.js';
import Notification from '../models/Notification.js';
import { IUser } from '../models/User.js';
import { sanitizeHtml } from '../middlewares/sanitize.js';
import cloudinary from '../config/cloudinary.js';
import { getIO } from '../socket.js';

export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courses = await Course.find({ instructorId: user._id }).lean();
    const courseIds = courses.map(c => c._id);
    const totalStudents = await Enrollment.countDocuments({ courseId: { $in: courseIds } });
    const totalRevenue = courses.reduce((acc, c) => acc + (c.price || 0) * (c.totalStudents || 0), 0);
    const pendingQuestions = await Question.countDocuments({ courseId: { $in: courseIds }, answer: null });
    res.json({ success: true, data: { courses, totalStudents, totalRevenue, pendingQuestions } });
  } catch (err) { next(err); }
};

export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courseData = { ...req.body, instructorId: user._id, description: sanitizeHtml(req.body.description || '') };
    const course = await Course.create(courseData);
    res.status(201).json({ success: true, data: course });
  } catch (err) { next(err); }
};

export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, instructorId: user._id },
      { ...req.body, description: sanitizeHtml(req.body.description || '') },
      { new: true }
    );
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) { next(err); }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.id, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lessonCount = await Lesson.countDocuments({ courseId: course._id });
    if (lessonCount < 20) return res.status(400).json({ success: false, message: 'Need at least 20 lessons' });
    if (!course.title || !course.description) return res.status(400).json({ success: false, message: 'Title and description required' });
    course.approvalStatus = 'pending';
    await course.save();
    res.json({ success: true, message: 'Submitted for review' });
  } catch (err) { next(err); }
};

export const createLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.create({ ...req.body, courseId: course._id });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: 1 } });
    res.status(201).json({ success: true, data: lesson });
  } catch (err) { next(err); }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.findOneAndUpdate({ _id: req.params.lessonId, courseId: course._id }, req.body, { new: true });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    res.json({ success: true, data: lesson });
  } catch (err) { next(err); }
};

export const deleteLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.findOneAndDelete({ _id: req.params.lessonId, courseId: course._id });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: -1 } });
    res.json({ success: true, message: 'Lesson deleted' });
  } catch (err) { next(err); }
};

export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found or not yours' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `courses/${courseId}/media`, resource_type: 'auto' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      uploadStream.end(req.file!.buffer);
    });
    res.json({ success: true, data: { url: (result as any).secure_url, publicId: (result as any).public_id } });
  } catch (err) { next(err); }
};

export const getCourseQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questions = await Question.find({ courseId: req.params.courseId }).populate('userId', 'firstName lastName').sort('-createdAt');
    res.json({ success: true, data: questions });
  } catch (err) { next(err); }
};

export const answerQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: question.courseId, instructorId: user._id });
    if (!course && !user.roles.includes('admin')) return res.status(403).json({ success: false, message: 'Not authorized' });
    question.answer = answer;
    question.answeredAt = new Date();
    await question.save();
    await Notification.create({ userId: question.userId, title: 'Your question was answered', message: answer.substring(0, 100), type: 'course' });
    getIO().to(`user:${question.userId}`).emit('notification', { title: 'Question answered' });
    res.json({ success: true, message: 'Answer posted' });
  } catch (err) { next(err); }
};
