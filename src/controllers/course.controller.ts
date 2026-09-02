// ============================================================
// FILE: src/controllers/course.controller.ts
// (Rebuilt to match the live deployed response shape you confirmed,
//  with self-diagnosing access info added so this class of bug can be
//  read directly off the JSON response instead of needing manual
//  DevTools/Atlas checks every time.)
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
import Question from '../models/Question.js';
import { getIO } from '../socket.js';
import { getOrSetCache, invalidateCache } from '../services/cache.js';
import Academy from '../models/Academy.js';
import AcademyMembership from '../models/AcademyMembership.js';
import logger from '../utils/logger.js';

// Bump this string on every deploy of this file so a live JSON response
// (or a screenshot of one) tells you unambiguously which version is
// actually running — this is what let us catch, in the last debugging
// round, that the live server was NOT running the code we thought it was.
const DEBUG_BUILD_TAG = 'course-controller-fix-v5-diagnostic-access-gate';

function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

async function completeChallengeAndReward(challengeId: string, userId: string, adminNote: string = 'Auto‑completed') {
  try {
    const progress = await ChallengeProgress.findOne({ challengeId, userId });
    if (!progress || progress.status === 'completed') return;

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return;
    const user = await User.findById(userId);
    if (!user) return;

    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.progress = 100;
    progress.adminNote = adminNote;

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
      user.subscriptionExpires = new Date(currentExpiry.getTime() + challenge.rewardPremiumDays * 24 * 60 * 60 * 1000);
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
    try {
      getIO().to(`user:${user._id}`).emit('notification', {
        title: 'Challenge Completed!',
        message: `You earned rewards for completing "${challenge.title}"`,
      });
    } catch (e: any) {
      logger.error(`completeChallengeAndReward: socket emit failed: ${e?.message}`);
    }
  } catch (err: any) {
    logger.error(`completeChallengeAndReward: unexpected error: ${err?.message}`);
  }
}

async function attachLiveLessonCounts(courses: any[]) {
  if (courses.length === 0) return courses;
  const courseIds = courses.map((c) => c._id);
  const counts = await Lesson.aggregate([
    { $match: { courseId: { $in: courseIds } } },
    { $group: { _id: '$courseId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return courses.map((c) => ({ ...c, totalLessons: countMap.get(c._id.toString()) || 0 }));
}

// ==================== GET PUBLISHED COURSES ====================
export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, level, search, limit = 20, offset = 0, academyId } = req.query;
    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: String(search), $options: 'i' };
    if (academyId) {
      filter.$or = [{ academyId }, { academyOnly: { $ne: true } }];
    } else {
      filter.academyOnly = { $ne: true };
    }

    const cacheKey = `courses:${JSON.stringify({ category, level, search, limit, offset, academyId })}`;
    const data = await getOrSetCache(cacheKey, async () => {
      const courses = await Course.find(filter)
        .skip(Number(offset))
        .limit(Number(limit))
        .select('title price salePrice thumbnail level slug instructorId totalStudents avgRating academyId academyOnly whatYouWillLearn views')
        .populate('instructorId', 'firstName lastName')
        .lean();
      const coursesWithLessonCounts = await attachLiveLessonCounts(courses);
      const total = await Course.countDocuments(filter);
      return { courses: coursesWithLessonCounts, total };
    }, 3600);

    res.json({ success: true, data: data.courses, meta: { total: data.total } });
  } catch (err) {
    next(err);
  }
};

// ==================== GET SINGLE COURSE ====================
// This is the endpoint behind the multi-day "lesson content not showing"
// investigation. Three real bugs were found and fixed across that
// investigation:
//  1. This route had no auth middleware at all (fixed via
//     optionalAuthenticate in course.routes.ts) — req.user was always
//     undefined, so every request looked anonymous.
//  2. Lesson create/update/delete never invalidated this endpoint's
//     cache — edits could take up to 2h to appear.
//  3. The frontend's description fallback logic had a truthy-check bug
//     that could show placeholder text even with real (but sparse)
//     content present.
// This version adds a 4th layer: explicit, visible diagnostics in the
// response itself (accessDebug), so if access is ever denied again, the
// JSON tells you exactly why — no auth token found, user not found,
// user found but no enrollment record for THIS course id, etc. — instead
// of a bare `hasAccess: false` that requires re-running this whole
// investigation from scratch.
export const getCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = String(req.params.id || '');
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Course identifier is required' });
    }
    const cacheKey = `course:${identifier}`;

    const course = await getOrSetCache(cacheKey, async () => {
      let found = null;
      if (isValidObjectId(identifier)) {
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
        totalLessons: lessons.length,
        lessons,
        ratings,
      };
    }, 7200);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // ─── Academy access check ──────────────────────────────────────────
    if (course.academyOnly && course.academyId) {
      const user = req.user as IUser | undefined;
      if (!user) {
        return res.status(403).json({ success: false, message: 'This course is only available to academy members' });
      }
      const membership = await AcademyMembership.findOne({ academyId: course.academyId, userId: user._id });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'You are not a member of this academy' });
      }
    }

    // ─── Diagnostic-first access resolution ─────────────────────────────
    const reqUser = req.user as IUser | undefined;
    let accessDebug: Record<string, any> = {};

    if (!reqUser) {
      // This is the #1 real-world cause seen so far: a request reaching
      // this endpoint with no populated req.user at all — either genuinely
      // anonymous (e.g. pasting the API URL directly into a browser, which
      // sends no Authorization header), or optionalAuthenticate not
      // actually running / not deployed on this route.
      accessDebug = {
        reason: 'no_authenticated_user',
        note: 'req.user was undefined for this request — either no Bearer token was sent, the token was invalid/expired, or optionalAuthenticate is not attached to this route.',
      };
    }

    let enrollment = null;
    if (reqUser?._id) {
      enrollment = await Enrollment.findOne({ userId: reqUser._id, courseId: course._id });
      if (!enrollment) {
        accessDebug = {
          reason: 'user_authenticated_but_not_enrolled',
          note: 'req.user was populated correctly, but no Enrollment document exists for this userId + courseId pair.',
          userId: String(reqUser._id),
          courseId: String(course._id),
        };
      } else {
        accessDebug = {
          reason: 'enrolled',
          enrollmentId: String(enrollment._id),
          enrollmentStatus: enrollment.status,
        };
      }
    }

    const isFreeCourse = !course.price || course.price === 0;
    const hasAccess = !!enrollment || isFreeCourse;
    if (isFreeCourse && !enrollment) {
      accessDebug = { reason: 'free_course_no_enrollment_required', ...accessDebug };
    }

    const lessonsForResponse = hasAccess
      ? course.lessons
      : (course.lessons || []).map((l: any) => ({
          _id: l._id,
          title: l.title,
          type: l.type,
          duration: l.duration,
          order: l.order,
          locked: true,
        }));

    return res.json({
      success: true,
      _debugBuild: DEBUG_BUILD_TAG,
      data: {
        ...course,
        lessons: lessonsForResponse,
        hasAccess,
        // accessDebug is intentionally always present (not just when
        // access is denied) so a fetched response is self-explanatory
        // either way — "why do I have access" is as useful to see as
        // "why don't I".
        accessDebug,
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

// ─── GET USER ENROLLMENTS ───────────────────────────────────────────
export const getUserEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const enrollments = await Enrollment.find({ userId: user._id })
      .populate({
        path: 'courseId',
        select: 'title thumbnail totalLessons price rating level instructorId academyId academyOnly',
      })
      .lean();

    const courseIds = enrollments.map((e: any) => e.courseId?._id).filter(Boolean);
    const counts = await Lesson.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const formatted = enrollments.map((enrollment: any) => {
      const course = enrollment.courseId;
      if (course && course._id) {
        course.totalLessons = countMap.get(course._id.toString()) || 0;
      }
      return {
        _id: enrollment._id,
        userId: enrollment.userId,
        course,
        progress: enrollment.progress || 0,
        status: enrollment.status,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
        courseId: course?._id || enrollment.courseId,
        academyId: enrollment.academyId,
      };
    });
    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// ─── ENROLL COURSE ───────────────────────────────────────────────────
export const enrollCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      logger.error(`[ENROLL] Unauthenticated attempt.`);
      return res.status(401).json({ success: false, message: 'You must be logged in to enroll' });
    }
    const course = await Course.findById(req.params.id);
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not available' });
    }

    if (course.academyOnly && course.academyId) {
      const membership = await AcademyMembership.findOne({ academyId: course.academyId, userId: user._id });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'This course is only available to academy members' });
      }
    }

    const existing = await Enrollment.findOne({ userId: user._id, courseId: course._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    if (course.price > 0) {
      return res.json({ success: true, requirePayment: true, price: course.salePrice || course.price });
    }
    await Enrollment.create({
      userId: user._id,
      courseId: course._id,
      academyId: course.academyId || undefined,
    });
    course.totalStudents += 1;
    await course.save();
    await invalidateCourseCache(course._id.toString());
    const newEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id })
      .populate('courseId', 'title thumbnail totalLessons price rating level');

    let responseCourse: any = newEnrollment?.courseId;
    if (responseCourse && responseCourse._id) {
      const liveCount = await Lesson.countDocuments({ courseId: responseCourse._id });
      const plain = typeof responseCourse.toObject === 'function' ? responseCourse.toObject() : responseCourse;
      responseCourse = { ...plain, totalLessons: liveCount };
    }

    res.json({
      success: true,
      message: 'Enrolled successfully',
      data: {
        _id: newEnrollment?._id,
        course: responseCourse,
        progress: 0,
        status: 'active',
        academyId: course.academyId,
      },
    });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.userId && err.keyPattern?.courseId) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    next(err);
  }
};

// ─── UPDATE LESSON PROGRESS ─────────────────────────────────────────
export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId } = req.params;
    const { completed, timeSpent } = req.body;
    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: req.params.id });
    if (!enrollment) return res.status(400).json({ success: false, message: 'Not enrolled' });

    let progress = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId });
    if (!progress) {
      progress = new LessonProgress({ enrollmentId: enrollment._id, lessonId, completed, timeSpent: timeSpent || 0 });
    } else {
      if (completed) progress.completed = true;
      progress.timeSpent += timeSpent || 0;
    }

    if (completed && progress.completed) {
      const lesson = await Lesson.findById(lessonId);
      if (lesson) {
        const durationMinutes = lesson.duration || 0;
        const requiredMinutes = durationMinutes * 0.8;
        const timeSpentMinutes = (progress.timeSpent || 0) / 60;
        progress.completed = true;
        if (durationMinutes === 0 || timeSpentMinutes >= requiredMinutes) {
          user.xp = (user.xp || 0) + (lesson.xpReward || 50);
          await user.save();
        }
      }
    }

    await progress.save();

    const totalLessons = await Lesson.countDocuments({ courseId: enrollment.courseId });
    const completedLessons = await LessonProgress.countDocuments({ enrollmentId: enrollment._id, completed: true });
    enrollment.progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    if (enrollment.progress === 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      user.walletBalance = (user.walletBalance || 0) + 300;
      await user.save();
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: 300,
        status: 'completed',
        description: 'Course completion bonus',
      });
    }
    await enrollment.save();

    const activeChallenges = await ChallengeProgress.find({ userId: user._id, status: 'enrolled' }).populate('challengeId');
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

// ─── RATE COURSE ──────────────────────────────────────────────────
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
    await invalidateCourseCache(course._id.toString());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── TRACK COURSE VIEW ────────────────────────────────────────────
export const trackCourseView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid course id' });
    }
    const course = await Course.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true, select: 'views' });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    await invalidateCourseCache(id);
    res.json({ success: true, data: { views: course.views } });
  } catch (err) {
    next(err);
  }
};

// ─── ASK QUESTION ──────────────────────────────────────────────────
export const askQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id: courseId } = req.params;
    const { question, lessonId } = req.body;

    if (!question || question.trim() === '') {
      return res.status(400).json({ success: false, message: 'Question text is required' });
    }

    const course = await Course.findById(courseId);
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId });
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'You must be enrolled to ask questions' });
    }

    const newQuestion = await Question.create({
      userId: user._id,
      courseId,
      lessonId: lessonId || undefined,
      question: question.trim(),
    });

    res.status(201).json({ success: true, data: newQuestion });
  } catch (err) {
    next(err);
  }
};
