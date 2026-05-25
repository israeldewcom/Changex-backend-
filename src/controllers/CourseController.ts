// ============================================
// FILE: src/controllers/CourseController.ts (Complete – with timeSpent & completion bonus)
// ============================================
import { Request, Response } from 'express';
import { Course, Enrollment, User, Certificate, Review, CourseQuestion, CourseAnswer, Transaction, Referral } from '../models';
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
      const { page = 1, limit = 20, category, level, priceMin, priceMax, search, sortBy = 'createdAt', sortOrder = 'desc', featured, instructor, hasAffiliate } = req.query;
      const query: any = { published: true, approvalStatus: 'approved' };
      if (category) query.category = category;
      if (level) query.level = level;
      if (featured === 'true') query.featured = true;
      if (instructor) query.instructor = instructor;
      if (hasAffiliate === 'true') query.hasAffiliate = true;
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
      const course = await Course.findById(id)
        .populate('instructor', 'firstName lastName displayName avatar bio isApprovedInstructor')
        .populate('prerequisites', 'title slug thumbnail');
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      const sanitizedCourse = course.toObject();
      sanitizedCourse.lessons = sanitizedCourse.lessons?.map(lesson => ({
        ...lesson,
        content: lesson.content || '',
        description: lesson.description || lesson.content?.substring(0, 200) || 'No description available',
        videoUrl: lesson.videoUrl || '',
        resources: lesson.resources || []
      })) || [];
      res.json({ success: true, data: sanitizedCourse });
    } catch (error) {
      logger.error('Get course by ID error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getCourseReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const reviews = await Review.find({ course: id, isApproved: true })
        .populate('user', 'firstName lastName displayName avatar')
        .sort({ createdAt: -1 });
      const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / (reviews.length || 1);
      res.json({ success: true, data: { reviews, averageRating, total: reviews.length } });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  createCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const isAdmin = user.roles?.includes('admin');
      const isApprovedInstructor = user.roles?.includes('creator') && user.isApprovedInstructor === true;
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

      const {
        title = 'Untitled Course',
        description = 'No description provided',
        longDescription = 'No description provided',
        lessons = [],
        quizzes = [],
        price = 0,
        salePrice = 0,
        category = 'Web Development',
        level = 'beginner',
        thumbnail = '📚',
        subtitle = '',
        promoVideo = '',
        language = 'English',
        hasAffiliate = false,
        affiliatePercent = 15,
        affiliateDescription = ''
      } = req.body;

      const sanitizedLessons = (lessons || []).map((lesson: any, index: number) => ({
        title: lesson.title || `Lesson ${index + 1}`,
        description: lesson.description || '',
        type: lesson.type || 'text',
        content: lesson.content || '',
        videoUrl: lesson.videoUrl || '',
        duration: lesson.duration || 10,
        order: lesson.order || index + 1,
        xpReward: lesson.xpReward || 50,
        isFree: lesson.isFree || false,
        resources: lesson.resources || []
      }));

      let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let existing = await Course.findOne({ slug });
      let counter = 1;
      while (existing) {
        slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${counter}`;
        existing = await Course.findOne({ slug });
        counter++;
      }

      const courseData = {
        title,
        subtitle,
        description,
        longDescription,
        slug,
        instructor: userId,
        lessons: sanitizedLessons,
        quizzes: quizzes || [],
        price: Number(price) || 0,
        discountPrice: Number(salePrice) || 0,
        category,
        level: level.toLowerCase(),
        thumbnail,
        previewVideo: promoVideo,
        language,
        published: false,
        approvalStatus: 'pending',
        totalLessons: sanitizedLessons.length,
        hasAffiliate,
        affiliatePercent,
        affiliateDescription
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
      if (course.instructor.toString() !== userId && !(req as any).user?.roles?.includes('admin')) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }
      
      const updateData = req.body;
      if (updateData.lessons) {
        updateData.lessons = updateData.lessons.map((lesson: any, index: number) => ({
          ...lesson,
          order: lesson.order || index + 1,
          content: lesson.content || '',
          description: lesson.description || ''
        }));
        updateData.totalLessons = updateData.lessons.length;
      }
      if (updateData.title) {
        let newSlug = updateData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const existing = await Course.findOne({ slug: newSlug, _id: { $ne: id } });
        if (existing) {
          let counter = 1;
          while (await Course.findOne({ slug: `${newSlug}-${counter}`, _id: { $ne: id } })) counter++;
          newSlug = `${newSlug}-${counter}`;
        }
        updateData.slug = newSlug;
      }
      if (updateData.level) updateData.level = updateData.level.toLowerCase();
      updateData.lastUpdated = new Date();
      updateData.version = (course.version || 1) + 1;
      
      const updatedCourse = await Course.findByIdAndUpdate(id, updateData, { new: true });
      res.json({ success: true, data: updatedCourse, message: 'Course updated successfully' });
    } catch (error) {
      logger.error('Update course error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  enrollCourse = async (req: Request, res: Response): Promise<void> => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const { paymentMethod = 'wallet', affiliateCode, affiliateId } = req.body;
      
      const course = await Course.findById(courseId).session(session);
      if (!course) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      if (course.approvalStatus !== 'approved') {
        await session.abortTransaction();
        res.status(403).json({ success: false, message: 'Course not yet approved' });
        return;
      }
      
      const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId }).session(session);
      if (existingEnrollment) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'Already enrolled' });
        return;
      }
      
      const price = course.discountPrice || course.price;
      
      if (price === 0) {
        const enrollment = await Enrollment.create([{
          user: userId,
          course: courseId,
          paymentMethod: 'free',
          amountPaid: 0,
          currency: course.currency
        }], { session });
        await User.findByIdAndUpdate(userId, { $addToSet: { coursesEnrolled: courseId } }, { session });
        await this.earningEngine.addXP(userId, course.xpReward, session);
        await session.commitTransaction();
        res.json({ success: true, data: enrollment[0], message: 'Successfully enrolled in course' });
        return;
      }
      
      if (paymentMethod === 'wallet') {
        const user = await User.findById(userId).session(session);
        if (!user || user.walletBalance < price) {
          await session.abortTransaction();
          res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
          return;
        }
        
        user.walletBalance -= price;
        await user.save({ session });
        
        const enrollment = await Enrollment.create([{
          user: userId,
          course: courseId,
          paymentMethod: 'wallet',
          amountPaid: price,
          currency: course.currency
        }], { session });
        
        const transaction = new Transaction({
          user: userId,
          type: 'purchase',
          subtype: 'course',
          amount: price,
          currency: course.currency,
          status: 'completed',
          description: `Purchase of course: ${course.title}`,
          reference: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          paymentMethod: 'wallet',
          courseId: course._id,
          enrollmentId: enrollment[0]._id,
          completedAt: new Date(),
        });
        await transaction.save({ session });
        
        await User.findByIdAndUpdate(userId, { 
          $addToSet: { coursesEnrolled: courseId },
          $inc: { totalSpent: price }
        }, { session });
        
        course.enrollmentCount += 1;
        course.totalRevenue += price;
        await course.save({ session });
        
        await this.earningEngine.distributeCourseCommission(userId, courseId, price, transaction._id, session);
        
        // ✅ Handle affiliate tracking (from body OR cookie)
        let affId: string | null = null;
        let affCourseId: string | null = null;
        let affCode: string | null = null;
        
        if (affiliateCode && affiliateId) {
          affId = affiliateId;
          affCourseId = courseId;
          affCode = affiliateCode;
        } else {
          const affiliateCookie = req.cookies.cx_affiliate;
          if (affiliateCookie) {
            [affId, affCourseId, affCode] = affiliateCookie.split('|');
          }
        }
        
        // ✅ Additional check for cx_affiliate_code cookie (find by unique affiliate code)
        if (!affCode && !affId) {
          const codeCookie = req.cookies.cx_affiliate_code;
          if (codeCookie) {
            const affiliateUser = await User.findOne({ 'affiliateLinks.code': codeCookie }).session(session);
            if (affiliateUser) {
              const link = affiliateUser.affiliateLinks.find(l => l.code === codeCookie && l.courseId.toString() === courseId);
              if (link) {
                affId = affiliateUser._id.toString();
                affCourseId = courseId;
                affCode = codeCookie;
              }
            }
          }
        }
        
        if (affId && affCourseId === courseId && affCode) {
          const existingAff = await Referral.findOne({ referred: userId, type: 'affiliate', courseId }).session(session);
          if (!existingAff) {
            const referral = new Referral({
              referrer: affId,
              referred: userId,
              level: 1,
              status: 'completed',
              referralCode: affCode,
              type: 'affiliate',
              courseId,
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
            });
            await referral.save({ session });
            const commissionAmount = (price * (course.affiliatePercent || 15)) / 100;
            await this.earningEngine.addToWallet(affId, commissionAmount, 'affiliate', { courseId, referralId: referral._id }, session);
            const affiliateUser = await User.findById(affId).session(session);
            if (affiliateUser && affiliateUser.affiliateLinks) {
              const link = affiliateUser.affiliateLinks.find(l => l.link.includes(affCode as string) || l.code === affCode);
              if (link) {
                link.conversions = (link.conversions || 0) + 1;
                link.totalEarned = (link.totalEarned || 0) + commissionAmount;
                await affiliateUser.save({ session });
              }
            }
          }
        }
        
        // ✅ Process affiliate conversion if user came from affiliate link
        const conversionAffiliateCode = req.cookies.cx_affiliate_code || req.body.affiliateCode;
        if (conversionAffiliateCode) {
          const AffiliateService = require('../services/AffiliateService').AffiliateService;
          await AffiliateService.getInstance().processAffiliateConversion(
            userId, 
            courseId, 
            price, 
            transaction._id
          );
        }
        
        await session.commitTransaction();
        res.json({ success: true, data: enrollment[0], message: 'Successfully enrolled in course' });
      } else if (paymentMethod === 'stripe') {
        const { clientSecret, paymentIntentId } = await this.paymentService.createStripePaymentIntent(
          userId, price, course.currency,
          { type: 'course_purchase', courseId: course._id.toString(), userId }
        );
        res.json({ success: true, data: { clientSecret, paymentIntentId }, requiresPayment: true });
      } else if (paymentMethod === 'paystack') {
        const user = await User.findById(userId);
        const paymentUrl = await this.paymentService.createPaystackPaymentUrl(
          userId, price, user!.email,
          { type: 'course_purchase', courseId: course._id.toString(), userId }
        );
        res.json({ success: true, data: { paymentUrl }, requiresPayment: true });
      }
    } catch (error: any) {
      await session.abortTransaction();
      logger.error('Enroll course error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    } finally {
      session.endSession();
    }
  };

  getMyCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const enrollments = await Enrollment.find({ user: userId })
        .populate('course')
        .sort({ enrolledAt: -1 });
      res.json({ success: true, data: enrollments });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
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
          totalLessons: (enrollment.course as any)?.totalLessons || 0,
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { courseId, lessonId } = req.params;
      const userId = (req as any).user?.userId;
      const { completed, timeSpent } = req.body;
      
      const enrollment = await Enrollment.findOne({ user: userId, course: courseId }).session(session);
      if (!enrollment) {
        await session.abortTransaction();
        res.status(404).json({ success: false, message: 'Enrollment not found' });
        return;
      }
      
      if (completed && !enrollment.lessonsCompleted.includes(lessonId as any)) {
        enrollment.lessonsCompleted.push(lessonId as any);
        const course = await Course.findById(courseId).session(session);
        if (course) {
          enrollment.progress = (enrollment.lessonsCompleted.length / course.totalLessons) * 100;
        }
        await this.earningEngine.addLessonCompletionReward(userId, lessonId, courseId, 50, 10);
      }
      
      // ✅ Track time spent
      if (timeSpent && timeSpent > 0) {
        enrollment.timeSpent = (enrollment.timeSpent || 0) + timeSpent;
        await enrollment.save({ session });
      }
      
      enrollment.lastAccessedAt = new Date();
      enrollment.lastLessonId = lessonId as any;
      await enrollment.save({ session });
      
      const course = await Course.findById(courseId).session(session);
      const isTimeCompleted = course && (enrollment.timeSpent || 0) >= (course.totalDuration * 60);
      
      // ✅ Award course completion bonus if all lessons completed OR time threshold reached
      if (course && (enrollment.lessonsCompleted.length === course.totalLessons || isTimeCompleted) && enrollment.status !== 'completed') {
        enrollment.status = 'completed';
        enrollment.completedAt = new Date();
        await enrollment.save({ session });
        
        const certificate = await this.generateCertificate(userId, courseId, enrollment._id);
        await this.earningEngine.addCourseCompletionReward(userId, courseId, course.xpReward, 100);
        
        await session.commitTransaction();
        res.json({
          success: true,
          data: { progress: 100, completed: true, certificate },
          message: '🎉 Course completed! ₦100 bonus added to your wallet!'
        });
        return;
      }
      
      await session.commitTransaction();
      res.json({ success: true, data: { progress: enrollment.progress, completed: false } });
    } catch (error) {
      await session.abortTransaction();
      logger.error('Update lesson progress error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    } finally {
      session.endSession();
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
      logger.error('Rate course error:', error);
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
        .populate({ path: 'answers', populate: { path: 'user', select: 'firstName lastName avatar roles' } });
      res.json({ success: true, data: questions });
    } catch (error) {
      logger.error('Get course questions error:', error);
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
      logger.error('Ask question error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  answerQuestion = async (req: Request, res: Response): Promise<void> => {
    try {
      const { questionId } = req.params;
      const userId = (req as any).user.userId;
      const { answer } = req.body;
      
      if (!answer || answer.length < 3) {
        res.status(400).json({ success: false, message: 'Answer must be at least 3 characters' });
        return;
      }
      
      const question = await CourseQuestion.findById(questionId).populate('course');
      if (!question) {
        res.status(404).json({ success: false, message: 'Question not found' });
        return;
      }
      
      const course = await Course.findById(question.course);
      if (course && course.instructor.toString() !== userId && !(req as any).user?.roles?.includes('admin')) {
        res.status(403).json({ success: false, message: 'Only the instructor can answer questions' });
        return;
      }
      
      const newAnswer = new CourseAnswer({ question: questionId, user: userId, answer });
      await newAnswer.save();
      
      question.answers.push(newAnswer._id);
      await question.save();
      
      await this.notificationService.sendNotification(question.user.toString(), 'course', {
        title: 'Your question was answered',
        message: `Instructor answered: ${answer.substring(0, 80)}...`,
        metadata: { questionId, courseId: question.course }
      });
      
      res.status(201).json({ success: true, data: newAnswer });
    } catch (error) {
      logger.error('Answer question error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  private async generateCertificate(userId: string, courseId: string, enrollmentId: mongoose.Types.ObjectId): Promise<any> {
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);
    if (!user || !course) throw new Error('User or course not found');
    const certificateId = `CHX-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-certificate/${certificateId}`;
    const CertificateModel = require('../models/Certificate').Certificate;
    const certificate = new CertificateModel({
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
