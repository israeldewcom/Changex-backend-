// ============================================
// FILE: src/controllers/CourseController.ts (unchanged)
// ============================================
import { Request, Response } from 'express';
import { Course, Enrollment, User, Certificate } from '../models';
import { PaymentService, EarningEngine } from '../services';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class CourseController {
  private paymentService: PaymentService;
  private earningEngine: EarningEngine;
  constructor() {
    this.paymentService = PaymentService.getInstance();
    this.earningEngine = EarningEngine.getInstance();
  }

  getAllCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, category, level, priceMin, priceMax, search, sortBy = 'createdAt', sortOrder = 'desc', featured, instructor } = req.query;
      const query: any = { published: true };
      if (category) query.category = category;
      if (level) query.level = level;
      if (featured === 'true') query.featured = true;
      if (instructor) query.instructor = instructor;
      if (priceMin || priceMax) { query.price = {}; if (priceMin) query.price.$gte = Number(priceMin); if (priceMax) query.price.$lte = Number(priceMax); }
      if (search) query.$text = { $search: search as string };
      const sort: any = {}; sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
      const skip = (Number(page) - 1) * Number(limit);
      const [courses, total] = await Promise.all([Course.find(query).sort(sort).skip(skip).limit(Number(limit)).populate('instructor', 'firstName lastName displayName avatar'), Course.countDocuments(query)]);
      res.json({ success: true, data: { courses, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { logger.error('Get courses error:', error); res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getCourseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const course = await Course.findById(id).populate('instructor', 'firstName lastName displayName avatar bio').populate('prerequisites', 'title slug thumbnail');
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      res.json({ success: true, data: course });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  createCourse = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId);
      if (!user || !user.roles.includes('creator')) { res.status(403).json({ success: false, message: 'Not authorized to create courses' }); return; }
      const courseData = { ...req.body, instructor: userId, slug: req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') };
      const course = new Course(courseData);
      await course.save();
      res.status(201).json({ success: true, data: course, message: 'Course created successfully' });
    } catch (error: any) { res.status(500).json({ success: false, message: error.message || 'Server error' }); }
  };

  updateCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.userId;
      const course = await Course.findById(id);
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      if (course.instructor.toString() !== userId && !(req as any).user?.roles.includes('admin')) { res.status(403).json({ success: false, message: 'Not authorized' }); return; }
      const updateData = req.body;
      if (updateData.title) updateData.slug = updateData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      updateData.lastUpdated = new Date(); updateData.version = (course.version || 1) + 1;
      const updatedCourse = await Course.findByIdAndUpdate(id, updateData, { new: true });
      res.json({ success: true, data: updatedCourse, message: 'Course updated successfully' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  enrollCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const { paymentMethod = 'wallet' } = req.body;
      const course = await Course.findById(courseId);
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId });
      if (existingEnrollment) { res.status(400).json({ success: false, message: 'Already enrolled' }); return; }
      if (course.price === 0) {
        const enrollment = await Enrollment.create({ user: userId, course: courseId, paymentMethod: 'free', amountPaid: 0, currency: course.currency });
        await User.findByIdAndUpdate(userId, { $addToSet: { coursesEnrolled: courseId } });
        await this.earningEngine.addCourseCompletionReward(userId, courseId, course.xpReward, 0);
        res.json({ success: true, data: enrollment, message: 'Successfully enrolled in course' });
        return;
      }
      if (paymentMethod === 'wallet') {
        const enrollment = await this.paymentService.processCoursePurchase(userId, courseId, 'wallet');
        res.json({ success: true, data: enrollment, message: 'Successfully enrolled in course' });
      } else if (paymentMethod === 'stripe') {
        const { clientSecret, paymentIntentId } = await this.paymentService.createStripePaymentIntent(userId, course.price, course.currency, { type: 'course_purchase', courseId: course._id.toString(), userId });
        res.json({ success: true, data: { clientSecret, paymentIntentId }, requiresPayment: true });
      } else if (paymentMethod === 'paystack') {
        const user = await User.findById(userId);
        const paymentUrl = await this.paymentService.createPaystackPaymentUrl(userId, course.price, user!.email, { type: 'course_purchase', courseId: course._id.toString(), userId });
        res.json({ success: true, data: { paymentUrl }, requiresPayment: true });
      }
    } catch (error: any) { res.status(500).json({ success: false, message: error.message || 'Server error' }); }
  };

  getCourseProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const enrollment = await Enrollment.findOne({ user: userId, course: courseId }).populate('course');
      if (!enrollment) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
      res.json({ success: true, data: { progress: enrollment.progress, lessonsCompleted: enrollment.lessonsCompleted.length, totalLessons: (enrollment.course as any).totalLessons, quizzesCompleted: enrollment.quizzesCompleted.length, quizScores: enrollment.quizScores, lastAccessedAt: enrollment.lastAccessedAt, completedAt: enrollment.completedAt, certificateIssued: enrollment.certificateIssued } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  updateLessonProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId, lessonId } = req.params;
      const userId = (req as any).user?.userId;
      const { completed, timeSpent } = req.body;
      const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
      if (!enrollment) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
      if (completed && !enrollment.lessonsCompleted.includes(lessonId as any)) {
        enrollment.lessonsCompleted.push(lessonId as any);
        const course = await Course.findById(courseId);
        if (course) enrollment.progress = (enrollment.lessonsCompleted.length / course.totalLessons) * 100;
        await this.earningEngine.addLessonCompletionReward(userId, lessonId, courseId, 50, 10);
      }
      enrollment.lastAccessedAt = new Date();
      enrollment.lastLessonId = lessonId as any;
      await enrollment.save();
      const course = await Course.findById(courseId);
      if (course && enrollment.lessonsCompleted.length === course.totalLessons) {
        enrollment.status = 'completed';
        enrollment.completedAt = new Date();
        await enrollment.save();
        const certificate = await this.generateCertificate(userId, courseId, enrollment._id);
        await this.earningEngine.addCourseCompletionReward(userId, courseId, course.xpReward, 100);
        res.json({ success: true, data: { progress: enrollment.progress, completed: true, certificate }, message: 'Congratulations! You completed the course!' });
        return;
      }
      res.json({ success: true, data: { progress: enrollment.progress, completed: false } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  private async generateCertificate(userId: string, courseId: string, enrollmentId: mongoose.Types.ObjectId): Promise<any> {
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);
    if (!user || !course) throw new Error('User or course not found');
    const certificateId = `CHX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-certificate/${certificateId}`;
    const certificate = new Certificate({ user: userId, course: courseId, enrollment: enrollmentId, certificateId, verificationUrl, pdfUrl: `${process.env.FRONTEND_URL}/certificates/${certificateId}.pdf`, metadata: { userName: `${user.firstName} ${user.lastName}`, courseName: course.title, completionScore: 100, duration: course.totalDuration, instructorName: course.instructor.toString() } });
    await certificate.save();
    await Enrollment.findByIdAndUpdate(enrollmentId, { certificateIssued: true, certificateId: certificate._id });
    await User.findByIdAndUpdate(userId, { $addToSet: { certificatesEarned: certificate._id } });
    return certificate;
  }

  getMyCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const enrollments = await Enrollment.find({ user: userId }).populate('course').sort({ enrolledAt: -1 });
      res.json({ success: true, data: enrollments });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getCourseReviews = async (req: Request, res: Response): Promise<void> => {
    res.json({ success: true, data: { reviews: [], averageRating: 4.8, totalReviews: 0 } });
  };
}
