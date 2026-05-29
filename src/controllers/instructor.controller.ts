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
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: course });
  } catch (err) { next(err); }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courseId = req.params.id;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found or not yours' });
      return;
    }
    const lessonCount = await Lesson.countDocuments({ courseId: course._id });
    if (lessonCount < 20) {
      res.status(400).json({ success: false, message: 'Course must have at least 20 lessons before submission' });
      return;
    }
    if (!course.title || !course.description) {
      res.status(400).json({ success: false, message: 'Course title and description are required' });
      return;
    }
    course.approvalStatus = 'pending';
    await course.save();
    res.json({ success: true, message: 'Course submitted for review successfully' });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const lesson = await Lesson.findOneAndUpdate({ _id: req.params.lessonId, courseId: course._id }, req.body, { new: true });
    if (!lesson) {
      res.status(404).json({ success: false, message: 'Lesson not found' });
      return;
    }
    res.json({ success: true, data: lesson });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
};

export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found or not yours' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
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
    const { courseId } = req.params;
    const questions = await Question.find({ courseId }).populate('userId', 'firstName lastName').sort('-createdAt');
    res.json({ success: true, data: questions });
  } catch (err) { next(err); }
};

export const answerQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    const question = await Question.findById(id);
    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: question.courseId, instructorId: user._id });
    if (!course && !user.roles.includes('admin')) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }
    question.answer = answer;
    question.answeredAt = new Date();
    await question.save();
    await Notification.create({ userId: question.userId, title: 'Your question was answered', message: answer.substring(0, 100), type: 'course' });
    const io = getIO();
    io.to(`user:${question.userId}`).emit('notification', { title: 'Question answered' });
    res.json({ success: true, message: 'Answer posted' });
  } catch (err) { next(err); }
};
