// ============================================================
// FILE: src/controllers/course.controller.ts (UPDATED – CACHED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import LessonProgress from '../models/LessonProgress.js';
import Lesson from '../models/Lesson.js';
import Rating from '../models/Rating.js';
import Transaction from '../models/Transaction.js';
import { IUser } from '../models/User.js';
import { sanitizeHtml } from '../middlewares/sanitize.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
import Challenge from '../models/Challenge.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getIO } from '../socket.js';
import { getOrSetCache, invalidateCache } from '../services/cache.js';

// ─── Helper: auto‑complete challenge ──────────────────────────────────
async function completeChallengeAndReward(challengeId: string, userId: string, adminNote: string = 'Auto‑completed') {
  const progress = await ChallengeProgress.findOne({ challengeId, userId });
  if (!progress) return;
  if (progress.status === 'completed') return;
  progress.status = 'completed';
  progress.completedAt = new Date();
  progress.progress = 100;
  progress.adminNote = adminNote;
  await progress.save();

  const challenge = await Challenge.findById(challengeId);
  if (!challenge) return;
  const user = await User.findById(userId);
  if (!user) return;

  user.xp = (user.xp || 0) + (challenge.rewardXP || 0);
  let xpNeeded = user.level * 1000;
  while (user.xp >= xpNeeded) {
    user.level += 1;
    user.xp -= xpNeeded;
    xpNeeded = user.level * 1000;
  }

  if (challenge.rewardAmount && challenge.rewardAmount > 0) {
    user.walletBalance = (user.walletBalance || 0) + challenge.rewardAmount;
    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: challenge.rewardAmount,
      status: 'completed',
      description: `Challenge reward: ${challenge.title}`,
    });
  }

  if (challenge.rewardPremiumDays && challenge.rewardPremiumDays > 0) {
    const currentExpiry = user.subscriptionExpires || new Date();
    const newExpiry = new Date(currentExpiry.getTime() + challenge.rewardPremiumDays * 24 * 60 * 60 * 1000);
    user.subscriptionExpires = newExpiry;
    user.isPremium = true;
  }

  await user.save();
  progress.rewardClaimed = true;
  await progress.save();

  await Notification.create({
    userId: user._id,
    title: '🎉 Challenge Completed!',
    message: `You completed "${challenge.title}" and earned ${challenge.rewardXP} XP${challenge.rewardAmount ? `, ₦${challenge.rewardAmount} bonus` : ''}${challenge.rewardPremiumDays ? `, and ${challenge.rewardPremiumDays} days of Premium` : ''}.`,
    type: 'system',
  });
  getIO().to(`user:${user._id}`).emit('notification', {
    title: 'Challenge Completed!',
    message: `You earned rewards for completing "${challenge.title}"`,
  });
}

// ==================== GET PUBLISHED COURSES (CACHED) ====================
export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, level, search, limit = 20, offset = 0 } = req.query;
    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: search, $options: 'i' };

    const cacheKey = `courses:${JSON.stringify({ category, level, search, limit, offset })}`;
    const data = await getOrSetCache(cacheKey, async () => {
      const courses = await Course.find(filter)
        .skip(Number(offset))
        .limit(Number(limit))
        .select('title price thumbnail level slug instructorId totalStudents avgRating')
        .populate('instructorId', 'firstName lastName')
        .lean();
      const total = await Course.countDocuments(filter);
      return { courses, total };
    }, 3600);

    res.json({ success: true, data: data.courses, meta: { total: data.total } });
  } catch (err) {
    next(err);
  }
};

// ==================== GET SINGLE COURSE (CACHED) ====================
export const getCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const identifier = String(id);
    const cacheKey = `course:${identifier}`;

    const course = await getOrSetCache(cacheKey, async () => {
      let found;
      if (mongoose.Types.ObjectId.isValid(identifier)) {
        found = await Course.findById(identifier);
      }
      if (!found) {
        found = await Course.findOne({ slug: identifier });
      }
      if (!found) return null;

      const lessons = await Lesson.find({ courseId: found._id }).sort('order').lean();
      const ratings = await Rating.find({ courseId: found._id })
        .populate('userId', 'firstName lastName')
        .lean();

      return {
        ...found.toObject(),
        lessons,
        ratings,
      };
    }, 7200); // 2 hours

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let enrollment = null;
    if (req.user) {
      const user = req.user as IUser;
      enrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    }

    res.json({
      success: true,
      data: {
        ...course,
        enrollment: enrollment ? { progress: enrollment.progress, status: enrollment.status } : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── INVALIDATE CACHE ON COURSE UPDATE ──────────────────────────────
export const invalidateCourseCache = async (courseId: string) => {
  await invalidateCache(`course:${courseId}`);
  await invalidateCache('courses:*');
};

// ─── Other functions (unchanged) ──────────────────────────────────────
export const getUserEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const enrollments = await Enrollment.find({ userId: user._id })
      .populate({
        path: 'courseId',
        select: 'title thumbnail totalLessons price rating level instructorId',
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
      courseId: enrollment.courseId?._id || enrollment.courseId,
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
    // Invalidate cache for this course and courses list
    await invalidateCourseCache(course._id.toString());
    const newEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id })
      .populate('courseId', 'title thumbnail totalLessons price rating level');
    res.json({
      success: true,
      message: 'Enrolled successfully',
      data: {
        _id: newEnrollment?._id,
        course: newEnrollment?.courseId,
        progress: 0,
        status: 'active',
      },
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
            message: `You need to spend at least ${Math.ceil(requiredMinutes)} minutes on this lesson to earn XP and mark it complete.`,
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

    // Auto‑complete challenges
    const activeChallenges = await ChallengeProgress.find({
      userId: user._id,
      status: 'enrolled',
    }).populate('challengeId');

    const lesson = await Lesson.findById(lessonId);
    if (lesson && completed) {
      for (const cp of activeChallenges) {
        const challenge = cp.challengeId as any;
        if (!challenge || !challenge.completionCriteria) continue;
        const progressValue = (cp as any).progressValue || 0;

        if (challenge.completionCriteria.type === 'lessons') {
          const criteriaCourseId = challenge.completionCriteria.courseId?.toString();
          if (criteriaCourseId && lesson.courseId && lesson.courseId.toString() === criteriaCourseId) {
            (cp as any).progressValue = progressValue + 1;
            const newValue = (cp as any).progressValue;
            cp.progress = Math.min(100, Math.round((newValue / challenge.completionCriteria.targetCount) * 100));
            await cp.save();
            if (newValue >= challenge.completionCriteria.targetCount) {
              await completeChallengeAndReward(challenge._id.toString(), user._id.toString(), 'Auto‑completed via lesson progress');
            }
          }
        } else if (challenge.completionCriteria.type === 'xp') {
          const targetXP = challenge.completionCriteria.targetCount;
          if (user.xp >= targetXP) {
            cp.progress = 100;
            (cp as any).progressValue = targetXP;
            await cp.save();
            await completeChallengeAndReward(challenge._id.toString(), user._id.toString(), 'Auto‑completed via XP threshold');
          }
        }
      }
    }

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
    // Invalidate cache for this course
    await invalidateCourseCache(course._id.toString());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
