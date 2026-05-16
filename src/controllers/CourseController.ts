import { Request, Response } from 'express';
import { Course, Enrollment, User, Certificate, Review, CourseQuestion, CourseAnswer } from '../models';
import { PaymentService } from '../services/PaymentService';
import { EarningEngine } from '../services/EarningEngine';
import { NotificationService } from '../services/NotificationService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class CourseController {
  private paymentService: PaymentService;
  private earningEngine: EarningEngine;
  private notificationService: NotificationService;

  constructor() {
    this.paymentService = PaymentService.getInstance();
    this.earningEngine = EarningEngine.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  getAllCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, category, level, priceMin, priceMax, search, sortBy = 'createdAt', sortOrder = 'desc', featured, instructor } = req.query;
      const query: any = { published: true, approvalStatus: 'approved' };
      if (category) query.category = category;
      if (level) query.level = level;
      if (featured === 'true') query.featured = true;
      if (instructor) query.instructor = instructor;
      if (priceMin || priceMax) {
        query.price = {};
        if (priceMin) query.price.$gte = Number(priceMin);
        if (priceMax) query.price.$lte = Number(priceMax);
      }
      if (search) query.$text = { $search: search as string };
      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;
      const skip = (Number(page) - 1) * Number(limit);
      const [courses, total] = await Promise.all([
        Course.find(query).sort(sort).skip(skip).limit(Number(limit)).populate('instructor', 'firstName lastName displayName avatar'),
        Course.countDocuments(query)
      ]);
      res.json({ success: true, data: { courses, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) {
      logger.error('Get courses error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getCourseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const course = await Course.findById(id).populate('instructor', 'firstName lastName displayName avatar bio isApprovedInstructor').populate('prerequisites', 'title slug thumbnail');
      if (!course) { res.status(404).json({ success: false, message: 'Course not found' }); return; }
      res.json({ success: true, data: course });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getCourseReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const reviews = await Review.find({ course: id, isApproved: true }).populate('user', 'firstName lastName displayName avatar').sort({ createdAt: -1 });
      const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / (reviews.length || 1);
      res.json({ success: true, data: { reviews, averageRating, total: reviews.length } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  createCourse = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const isAdmin = user.roles.includes('admin');
      const isApprovedInstructor = user.roles.includes('creator') && user.isApprovedInstructor === true;
      const isPremiumActive = (user.subscriptionTier === 'premium' || user.subscriptionTier === 'elite') &&
                              user.subscriptionStatus === 'active' &&
                              (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > new Date());

      if (!isAdmin && !isApprovedInstructor && !isPremiumActive) {
        res.status(403).json({
          success: false,
          message: 'Not authorized to create courses. Please upgrade to Premium or get approved as an instructor.'
        });
        return;
      }

      const { title, description, longDescription, lessons, price, category, level, thumbnail } = req.body;
      if (!title) {
        res.status(400).json({ success: false, message: 'Title is required' });
        return;
      }

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const courseData = {
        title,
        description: description || 'No description provided',
        longDescription: longDescription || description || 'No description provided',
        slug,
        instructor: userId,
        lessons: lessons || [],
        price: price || 0,
        category: category || 'Web Development',
        level: level || 'Beginner',
        thumbnail: thumbnail || '📚',
        published: false,
        approvalStatus: 'pending',
        totalLessons: (lessons || []).length
      };
      const course = new Course(courseData);
      await course.save();
      res.status(201).json({ success: true, data: course, message: 'Course draft saved' });
    } catch (error: any) {
      logger.error('Create course error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
  };

  updateCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.userId;
      const course = await Course.findById(id);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      if (course.instructor.toString() !== userId && !(req as any).user?.roles.includes('admin')) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }
      const updateData = req.body;
      if (updateData.title) updateData.slug = updateData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (updateData.lessons) updateData.totalLessons = updateData.lessons.length;
      updateData.lastUpdated = new Date();
      updateData.version = (course.version || 1) + 1;
      const updatedCourse = await Course.findByIdAndUpdate(id, updateData, { new: true });
      res.json({ success: true, data: updatedCourse, message: 'Course updated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  enrollCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const { paymentMethod = 'wallet' } = req.body;
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      if (course.approvalStatus !== 'approved') {
        res.status(403).json({ success: false, message: 'Course not yet approved' });
        return;
      }
      const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId });
      if (existingEnrollment) {
        res.status(400).json({ success: false, message: 'Already enrolled' });
        return;
      }
      if (course.price === 0) {
        const enrollment = await Enrollment.create({
          user: userId,
          course: courseId,
          paymentMethod: 'free',
          amountPaid: 0,
          currency: course.currency
        });
        await User.findByIdAndUpdate(userId, { $addToSet: { coursesEnrolled: courseId } });
        await this.earningEngine.addXP(userId, course.xpReward, null as any);
        res.json({ success: true, data: enrollment, message: 'Successfully enrolled in course' });
        return;
      }
      if (paymentMethod === 'wallet') {
        const enrollment = await this.paymentService.processCoursePurchase(userId, courseId, 'wallet');
        res.json({ success: true, data: enrollment, message: 'Successfully enrolled in course' });
      } else if (paymentMethod === 'stripe') {
        const { clientSecret, paymentIntentId } = await this.paymentService.createStripePaymentIntent(
          userId,
          course.price,
          course.currency,
          { type: 'course_purchase', courseId: course._id.toString(), userId }
        );
        res.json({ success: true, data: { clientSecret, paymentIntentId }, requiresPayment: true });
      } else if (paymentMethod === 'paystack') {
        const user = await User.findById(userId);
        const paymentUrl = await this.paymentService.createPaystackPaymentUrl(
          userId,
          course.price,
          user!.email,
          { type: 'course_purchase', courseId: course._id.toString(), userId }
        );
        res.json({ success: true, data: { paymentUrl }, requiresPayment: true });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
  };

  getCourseProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const enrollment = await Enrollment.findOne({ user: userId, course: courseId }).populate('course');
      if (!enrollment) {
        res.status(404).json({ success: false, message: 'Enrollment not found' });
        return;
      }
      res.json({
        success: true,
        data: {
          progress: enrollment.progress,
          lessonsCompleted: enrollment.lessonsCompleted.length,
          totalLessons: (enrollment.course as any).totalLessons,
          quizzesCompleted: enrollment.quizzesCompleted.length,
          quizScores: enrollment.quizScores,
          lastAccessedAt: enrollment.lastAccessedAt,
          completedAt: enrollment.completedAt,
          certificateIssued: enrollment.certificateIssued
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  updateLessonProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId, lessonId } = req.params;
      const userId = (req as any).user?.userId;
      const { completed, timeSpent } = req.body;
      const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
      if (!enrollment) {
        res.status(404).json({ success: false, message: 'Enrollment not found' });
        return;
      }
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
        res.json({
          success: true,
          data: { progress: enrollment.progress, completed: true, certificate },
          message: 'Congratulations! You completed the course!'
        });
        return;
      }
      res.json({ success: true, data: { progress: enrollment.progress, completed: false } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getMyCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const enrollments = await Enrollment.find({ user: userId }).populate('course').sort({ enrolledAt: -1 });
      res.json({ success: true, data: enrollments });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  rateCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.userId;
      const { rating, review } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        return;
      }
      const enrollment = await Enrollment.findOne({ user: userId, course: id, status: 'completed' });
      if (!enrollment) {
        res.status(403).json({ success: false, message: 'You must complete the course to rate it' });
        return;
      }
      const existingReview = await Review.findOne({ user: userId, course: id });
      if (existingReview) {
        existingReview.rating = rating;
        existingReview.content = review || existingReview.content;
        await existingReview.save();
      } else {
        await Review.create({
          user: userId,
          course: id,
          rating,
          title: 'Course review',
          content: review || '',
          isVerifiedPurchase: true,
          isApproved: true
        });
      }
      const allReviews = await Review.find({ course: id });
      const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / (allReviews.length || 1);
      await Course.findByIdAndUpdate(id, { rating: avgRating, reviewCount: allReviews.length });
      res.json({ success: true, message: 'Rating submitted' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getCourseQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.userId;
      const enrollment = await Enrollment.findOne({ user: userId, course: id });
      if (!enrollment) {
        res.status(403).json({ success: false, message: 'You must be enrolled to see Q&A' });
        return;
      }
      const questions = await CourseQuestion.find({ course: id })
        .populate('user', 'firstName lastName avatar')
        .populate({
          path: 'answers',
          populate: { path: 'user', select: 'firstName lastName avatar roles' }
        });
      res.json({ success: true, data: questions });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  askQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.userId;
      const { lessonId, question } = req.body;
      if (!question || question.length < 10) {
        res.status(400).json({ success: false, message: 'Question must be at least 10 characters' });
        return;
      }
      const enrollment = await Enrollment.findOne({ user: userId, course: id });
      if (!enrollment) {
        res.status(403).json({ success: false, message: 'You must be enrolled to ask a question' });
        return;
      }
      const newQuestion = new CourseQuestion({ course: id, lessonId, user: userId, question });
      await newQuestion.save();
      const course = await Course.findById(id).populate('instructor', '_id');
      if (course && course.instructor) {
        await this.notificationService.sendNotification(course.instructor._id.toString(), 'course', {
          title: 'New student question',
          message: `New question: ${question.substring(0, 80)}...`,
          metadata: { courseId: id, questionId: newQuestion._id }
        });
      }
      res.status(201).json({ success: true, data: newQuestion });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  private async generateCertificate(userId: string, courseId: string, enrollmentId: mongoose.Types.ObjectId): Promise<any> {
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);
    if (!user || !course) throw new Error('User or course not found');
    const certificateId = `CHX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-certificate/${certificateId}`;
    const certificate = new Certificate({
      user: userId,
      course: courseId,
      enrollment: enrollmentId,
      certificateId,
      verificationUrl,
      pdfUrl: `${process.env.FRONTEND_URL}/certificates/${certificateId}.pdf`,
      metadata: {
        userName: `${user.firstName} ${user.lastName}`,
        courseName: course.title,
        completionScore: 100,
        duration: course.totalDuration,
        instructorName: course.instructor.toString()
      }
    });
    await certificate.save();
    await Enrollment.findByIdAndUpdate(enrollmentId, { certificateIssued: true, certificateId: certificate._id });
    await User.findByIdAndUpdate(userId, { $addToSet: { certificatesEarned: certificate._id } });
    return certificate;
  }
}
