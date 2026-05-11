// src/controllers/InstructorController.ts
import { Request, Response } from 'express';
import { Course, Enrollment, User, CourseApproval, CourseQuestion, CourseAnswer } from '../models';
import { FileUploadService } from '../services/FileUploadService';
import { NotificationService } from '../services/NotificationService';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';

export class InstructorController {
  private fileUploadService = FileUploadService.getInstance();
  private notificationService = NotificationService.getInstance();

  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const courses = await Course.find({ instructor: userId });
      const courseIds = courses.map(c => c._id);
      const enrollments = await Enrollment.aggregate([
        { $match: { course: { $in: courseIds } } },
        { $group: { _id: null, totalStudents: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }
      ]);
      const totalRevenue = courses.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
      const totalStudents = enrollments[0]?.totalStudents || 0;
      const completedStudents = enrollments[0]?.completed || 0;
      const pendingQuestions = await CourseQuestion.countDocuments({ course: { $in: courseIds }, isAnswered: false });
      res.json({ success: true, data: { totalCourses: courses.length, totalStudents, completedStudents, totalRevenue, pendingQuestions } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  submitCourseForApproval = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = (req as any).user?.userId;
      const { courseId } = req.params;
      const course = await Course.findOne({ _id: courseId, instructor: userId }).session(session);
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      if (course.lessons.length < 20) { res.status(400).json({ success: false, message: 'Minimum 20 lessons required' }); return; }
      let approval = await CourseApproval.findOne({ course: courseId }).session(session);
      if (!approval) {
        approval = new CourseApproval({ course: courseId, instructor: userId, status: 'pending', submittedAt: new Date() });
      } else {
        approval.status = 'pending';
        approval.submittedAt = new Date();
        approval.reviewedAt = undefined;
        approval.rejectionReason = undefined;
      }
      await approval.save({ session });
      course.published = false; // unpublished until approved
      await course.save({ session });
      await session.commitTransaction();
      // Notify admins
      const admins = await User.find({ roles: 'admin' }).select('_id');
      for (const admin of admins) {
        await this.notificationService.sendNotification(admin._id.toString(), 'system', {
          title: 'New Course Submitted',
          message: `${course.title} has been submitted for approval`,
          metadata: { courseId, instructorId: userId }
        });
      }
      res.json({ success: true, message: 'Course submitted for approval' });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Server error' });
    } finally { session.endSession(); }
  };

  uploadCourseMedia = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { courseId, type } = req.params;
      const course = await Course.findOne({ _id: courseId, instructor: userId });
      if (!course) { res.status(403).json({ success: false, message: 'Not authorized' }); return; }
      if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }
      const url = await this.fileUploadService.uploadCourseMedia(req.file, courseId, type as any);
      if (type === 'thumbnail') {
        course.thumbnail = url;
        await course.save();
      }
      res.json({ success: true, data: { url }, message: `${type} uploaded` });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getCourseQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { courseId } = req.params;
      const course = await Course.findOne({ _id: courseId, instructor: userId });
      if (!course) { res.status(403).json({ success: false, message: 'Not authorized' }); return; }
      const questions = await CourseQuestion.find({ course: courseId }).populate('user', 'firstName lastName displayName avatar').populate('answers');
      res.json({ success: true, data: questions });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  answerQuestion = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = (req as any).user?.userId;
      const { questionId } = req.params;
      const { answer } = req.body;
      const question = await CourseQuestion.findById(questionId).populate('course');
      if (!question) { res.status(404).json({ success: false, message: 'Question not found' }); return; }
      const course = await Course.findById(question.course);
      if (!course || course.instructor.toString() !== userId) { res.status(403).json({ success: false, message: 'Not authorized' }); return; }
      const newAnswer = new CourseAnswer({ question: questionId, user: userId, answer, isInstructorAnswer: true });
      await newAnswer.save({ session });
      question.answers.push(newAnswer._id);
      question.isAnswered = true;
      await question.save({ session });
      await this.notificationService.sendNotification(question.user.toString(), 'course', {
        title: 'Your question has been answered',
        message: `Instructor replied to "${question.question.substring(0, 50)}..."`,
        metadata: { courseId: course._id, questionId }
      });
      await session.commitTransaction();
      res.json({ success: true, data: newAnswer });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: 'Server error' });
    } finally { session.endSession(); }
  };
}
