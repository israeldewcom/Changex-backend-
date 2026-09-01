// ============================================================
// FILE: src/controllers/course.controller.ts
// (HARDENED — every function validates input, guards every DB call,
//  and falls back safely instead of throwing unmasked/uncaught errors)
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

// ─── Small input guards, reused across every handler below ─────────────
// Centralizing these means every endpoint validates the same way instead
// of each function inventing its own (and inevitably missing a case).
function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function toSafeInt(value: unknown, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function toSafeString(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLen);
}

// ─── Helper: auto‑complete challenge ────────────────────────────────
// Wrapped so a failure here (e.g. malformed challenge doc, missing user)
// never bubbles up and takes down the caller's whole request — progress
// tracking is best-effort, not something that should 500 a lesson update.
async function completeChallengeAndReward(
  challengeId: string,
  userId: string,
  adminNote: string = 'Auto‑completed'
): Promise<void> {
  try {
    if (!isValidObjectId(challengeId) || !isValidObjectId(userId)) {
      logger.error(`completeChallengeAndReward: invalid id(s) challengeId=${challengeId} userId=${userId}`);
      return;
    }

    const progress = await ChallengeProgress.findOne({ challengeId, userId }).catch((e) => {
      logger.error(`completeChallengeAndReward: ChallengeProgress lookup failed: ${e?.message}`);
      return null;
    });
    if (!progress) return;
    if (progress.status === 'completed') return;

    const challenge = await Challenge.findById(challengeId).catch((e) => {
      logger.error(`completeChallengeAndReward: Challenge lookup failed: ${e?.message}`);
      return null;
    });
    if (!challenge) return;

    const user = await User.findById(userId).catch((e) => {
      logger.error(`completeChallengeAndReward: User lookup failed: ${e?.message}`);
      return null;
    });
    if (!user) return;

    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.progress = 100;
    progress.adminNote = adminNote;

    user.xp = (Number(user.xp) || 0) + (Number(challenge.rewardXP) || 0);
    // level defensively defaults to 1 if missing/corrupt, so xpNeeded is
    // never NaN or zero (which would loop forever below).
    let level = Number(user.level) > 0 ? Number(user.level) : 1;
    let xpNeeded = level * 1000;
    let safetyCounter = 0; // hard stop against any pathological/looping xp value
    while (user.xp >= xpNeeded && safetyCounter < 10000) {
      level += 1;
      user.xp -= xpNeeded;
      xpNeeded = level * 1000;
      safetyCounter += 1;
    }
    user.level = level;

    if (typeof challenge.rewardAmount === 'number' && challenge.rewardAmount > 0) {
      user.walletBalance = (Number(user.walletBalance) || 0) + challenge.rewardAmount;
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: challenge.rewardAmount,
        status: 'completed',
        description: `Challenge reward: ${toSafeString(challenge.title, 200) || 'Challenge'}`,
      }).catch((e) => logger.error(`completeChallengeAndReward: Transaction.create failed: ${e?.message}`));
    }

    if (typeof challenge.rewardPremiumDays === 'number' && challenge.rewardPremiumDays > 0) {
      const currentExpiry = user.subscriptionExpires instanceof Date ? user.subscriptionExpires : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + challenge.rewardPremiumDays * 24 * 60 * 60 * 1000);
      user.subscriptionExpires = newExpiry;
      user.isPremium = true;
    }

    await user.save().catch((e) => logger.error(`completeChallengeAndReward: user.save failed: ${e?.message}`));
    progress.rewardClaimed = true;
    await progress.save().catch((e) => logger.error(`completeChallengeAndReward: progress.save failed: ${e?.message}`));

    const safeTitle = toSafeString(challenge.title, 200) || 'a challenge';
    await Notification.create({
      userId: user._id,
      title: '🎉 Challenge Completed!',
      message: `You completed "${safeTitle}" and earned ${Number(challenge.rewardXP) || 0} XP${challenge.rewardAmount ? `, ₦${challenge.rewardAmount} bonus` : ''}${challenge.rewardPremiumDays ? `, and ${challenge.rewardPremiumDays} days of Premium` : ''}.`,
      type: 'system',
    }).catch((e) => logger.error(`completeChallengeAndReward: Notification.create failed: ${e?.message}`));

    try {
      getIO().to(`user:${user._id}`).emit('notification', {
        title: 'Challenge Completed!',
        message: `You earned rewards for completing "${safeTitle}"`,
      });
    } catch (e: any) {
      // Socket emission failing (e.g. IO not initialized in this context)
      // must never fail the underlying reward logic above, which has
      // already been persisted by this point.
      logger.error(`completeChallengeAndReward: socket emit failed: ${e?.message}`);
    }
  } catch (err: any) {
    // Absolute last-resort guard: this function is called fire-and-forget
    // from inside updateLessonProgress and must never throw into its caller.
    logger.error(`completeChallengeAndReward: unexpected error: ${err?.message}`);
  }
}

// ─── Helper: attach LIVE lesson counts to a list of course objects ────
// totalLessons on the Course document is a cached counter that only
// createLesson/deleteLesson keep in sync — anything that adds/removes
// Lesson docs another way (seed script, bulk import, direct DB edit)
// leaves it stale. This recomputes the true count on every read instead.
async function attachLiveLessonCounts(courses: any[]): Promise<any[]> {
  if (!Array.isArray(courses) || courses.length === 0) return Array.isArray(courses) ? courses : [];
  try {
    const courseIds = courses
      .map((c) => c?._id)
      .filter((id) => id != null);
    if (courseIds.length === 0) return courses.map((c) => ({ ...c, totalLessons: 0 }));

    const counts = await Lesson.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));
    return courses.map((c) => ({
      ...c,
      totalLessons: c?._id ? countMap.get(String(c._id)) || 0 : 0,
    }));
  } catch (err: any) {
    // If the aggregation itself fails (DB hiccup, bad ids), degrade to
    // whatever totalLessons the course documents already had rather than
    // failing the whole listing request over a count refinement.
    logger.error(`attachLiveLessonCounts: aggregation failed: ${err?.message}`);
    return courses.map((c) => ({ ...c, totalLessons: Number(c?.totalLessons) || 0 }));
  }
}

// ==================== GET PUBLISHED COURSES ====================
export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = toSafeString(req.query.category, 100) || undefined;
    const level = toSafeString(req.query.level, 50) || undefined;
    const search = toSafeString(req.query.search, 200) || undefined;
    const limit = toSafeInt(req.query.limit, 20, { min: 1, max: 100 });
    const offset = toSafeInt(req.query.offset, 0, { min: 0, max: 100000 });
    const academyIdRaw = req.query.academyId;
    const academyId = isValidObjectId(academyIdRaw) ? String(academyIdRaw) : undefined;

    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) {
      // Escape regex metacharacters in user-supplied search text so a
      // crafted query string can't build an unintended/expensive regex.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escaped, $options: 'i' };
    }
    if (academyId) {
      filter.$or = [{ academyId }, { academyOnly: { $ne: true } }];
    } else {
      filter.academyOnly = { $ne: true };
    }

    const cacheKey = `courses:${JSON.stringify({ category, level, search, limit, offset, academyId })}`;

    const data = await getOrSetCache(cacheKey, async () => {
      const courses = await Course.find(filter)
        .skip(offset)
        .limit(limit)
        .select('title price salePrice thumbnail level slug instructorId totalStudents avgRating academyId academyOnly whatYouWillLearn views')
        .populate('instructorId', 'firstName lastName')
        .lean()
        .catch((e) => {
          logger.error(`getPublishedCourses: Course.find failed: ${e?.message}`);
          return [];
        });

      const coursesWithLessonCounts = await attachLiveLessonCounts(courses || []);

      const total = await Course.countDocuments(filter).catch((e) => {
        logger.error(`getPublishedCourses: countDocuments failed: ${e?.message}`);
        return coursesWithLessonCounts.length;
      });

      return { courses: coursesWithLessonCounts, total };
    }, 3600).catch((e: any) => {
      // If the cache layer itself throws (Redis down, serialization
      // error), fail soft with an empty result set instead of 500ing —
      // an empty Explore page is recoverable; a hard crash isn't.
      logger.error(`getPublishedCourses: cache layer failed: ${e?.message}`);
      return { courses: [], total: 0 };
    });

    return res.json({
      success: true,
      data: Array.isArray(data?.courses) ? data.courses : [],
      meta: { total: Number(data?.total) || 0 },
    });
  } catch (err) {
    next(err);
  }
};

// ==================== GET SINGLE COURSE ====================
export const getCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const identifier = toSafeString(req.params?.id, 200);
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Course identifier is required' });
    }
    const cacheKey = `course:${identifier}`;

    const course = await getOrSetCache(cacheKey, async () => {
      let found = null;
      try {
        if (isValidObjectId(identifier)) {
          found = await Course.findById(identifier);
        }
        if (!found) {
          found = await Course.findOne({ slug: identifier });
        }
      } catch (e: any) {
        logger.error(`getCourse: Course lookup failed: ${e?.message}`);
        return null;
      }
      if (!found) return null;

      const [lessons, ratings] = await Promise.all([
        Lesson.find({ courseId: found._id }).sort('order').lean().catch((e) => {
          logger.error(`getCourse: Lesson.find failed: ${e?.message}`);
          return [];
        }),
        Rating.find({ courseId: found._id })
          .populate('userId', 'firstName lastName')
          .lean()
          .catch((e) => {
            logger.error(`getCourse: Rating.find failed: ${e?.message}`);
            return [];
          }),
      ]);

      return {
        ...found.toObject(),
        totalLessons: Array.isArray(lessons) ? lessons.length : 0,
        lessons: Array.isArray(lessons) ? lessons : [],
        ratings: Array.isArray(ratings) ? ratings : [],
      };
    }, 7200).catch((e: any) => {
      logger.error(`getCourse: cache layer failed: ${e?.message}`);
      return null;
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // ─── Academy access check ────────────────────────────────────────
    if (course.academyOnly && course.academyId) {
      const user = req.user as IUser | undefined;
      if (!user) {
        return res.status(403).json({ success: false, message: 'This course is only available to academy members' });
      }
      const membership = await AcademyMembership.findOne({ academyId: course.academyId, userId: user._id }).catch((e) => {
        logger.error(`getCourse: AcademyMembership lookup failed: ${e?.message}`);
        return null;
      });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'You are not a member of this academy' });
      }
    }

    let enrollment = null;
    const reqUser = req.user as IUser | undefined;
    if (reqUser?._id) {
      enrollment = await Enrollment.findOne({ userId: reqUser._id, courseId: course._id }).catch((e) => {
        logger.error(`getCourse: Enrollment lookup failed: ${e?.message}`);
        return null;
      });
    }

    const isFreeCourse = !course.price || course.price === 0;
    const hasAccess = !!enrollment || isFreeCourse;

    const lessonsForResponse = hasAccess
      ? course.lessons
      : (Array.isArray(course.lessons) ? course.lessons : []).map((l: any) => ({
          _id: l?._id,
          title: toSafeString(l?.title, 200) || 'Lesson',
          type: l?.type || 'text',
          duration: Number(l?.duration) || 0,
          order: Number(l?.order) || 0,
          locked: true,
        }));

    return res.json({
      success: true,
      data: {
        ...course,
        lessons: lessonsForResponse,
        hasAccess,
        enrollment: enrollment ? { progress: enrollment.progress ?? 0, status: enrollment.status ?? 'active' } : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── INVALIDATE CACHE ON COURSE UPDATE ──────────────────────────────
export const invalidateCourseCache = async (courseId: string): Promise<void> => {
  if (!isValidObjectId(courseId)) {
    logger.error(`invalidateCourseCache: invalid courseId=${courseId}`);
    return;
  }
  try {
    await invalidateCache(`course:${courseId}`);
    await invalidateCache('courses:*');
  } catch (err: any) {
    // Cache invalidation failing should never break the caller's main
    // operation (which has usually already succeeded and saved by the
    // time this runs) — worst case, a stale cache entry lingers until TTL.
    logger.error(`invalidateCourseCache: failed for courseId=${courseId}: ${err?.message}`);
  }
};

// ─── GET USER ENROLLMENTS ───────────────────────────────────────────
export const getUserEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser | undefined;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const enrollments = await Enrollment.find({ userId: user._id })
      .populate({
        path: 'courseId',
        select: 'title thumbnail totalLessons price rating level instructorId academyId academyOnly',
      })
      .lean()
      .catch((e) => {
        logger.error(`getUserEnrollments: Enrollment.find failed: ${e?.message}`);
        return [];
      });

    const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];

    const courseIds = safeEnrollments
      .map((e: any) => e?.courseId?._id)
      .filter((id) => id != null);

    let countMap = new Map<string, number>();
    if (courseIds.length > 0) {
      const counts = await Lesson.aggregate([
        { $match: { courseId: { $in: courseIds } } },
        { $group: { _id: '$courseId', count: { $sum: 1 } } },
      ]).catch((e) => {
        logger.error(`getUserEnrollments: Lesson.aggregate failed: ${e?.message}`);
        return [];
      });
      countMap = new Map((counts || []).map((c: any) => [String(c._id), c.count]));
    }

    const formatted = safeEnrollments.map((enrollment: any) => {
      const course = enrollment?.courseId as any;
      if (course && course._id) {
        course.totalLessons = countMap.get(String(course._id)) || 0;
      }
      return {
        _id: enrollment?._id,
        userId: enrollment?.userId,
        course: course || null,
        progress: Number(enrollment?.progress) || 0,
        status: enrollment?.status || 'active',
        startedAt: enrollment?.startedAt || null,
        completedAt: enrollment?.completedAt || null,
        courseId: course?._id || enrollment?.courseId || null,
        academyId: enrollment?.academyId || null,
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

// ─── ENROLL COURSE ───────────────────────────────────────────────────
export const enrollCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser | undefined;
    if (!user?._id) {
      logger.error(`enrollCourse: unauthenticated attempt`);
      return res.status(401).json({ success: false, message: 'You must be logged in to enroll' });
    }

    const courseId = toSafeString(req.params?.id, 100);
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course id' });
    }

    const course = await Course.findById(courseId).catch((e) => {
      logger.error(`enrollCourse: Course.findById failed: ${e?.message}`);
      return null;
    });
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not available' });
    }

    if (course.academyOnly && course.academyId) {
      const membership = await AcademyMembership.findOne({ academyId: course.academyId, userId: user._id }).catch((e) => {
        logger.error(`enrollCourse: AcademyMembership lookup failed: ${e?.message}`);
        return null;
      });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'This course is only available to academy members' });
      }
    }

    const existing = await Enrollment.findOne({ userId: user._id, courseId: course._id }).catch((e) => {
      logger.error(`enrollCourse: Enrollment lookup failed: ${e?.message}`);
      return null;
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }

    if (typeof course.price === 'number' && course.price > 0) {
      return res.json({ success: true, requirePayment: true, price: course.salePrice || course.price });
    }

    let newEnrollmentDoc;
    try {
      newEnrollmentDoc = await Enrollment.create({
        userId: user._id,
        courseId: course._id,
        academyId: course.academyId || undefined,
      });
    } catch (e: any) {
      if (e?.code === 11000 && e?.keyPattern?.userId && e?.keyPattern?.courseId) {
        return res.status(400).json({ success: false, message: 'Already enrolled' });
      }
      throw e;
    }

    course.totalStudents = (Number(course.totalStudents) || 0) + 1;
    await course.save().catch((e) => logger.error(`enrollCourse: course.save failed: ${e?.message}`));
    await invalidateCourseCache(course._id.toString());

    const newEnrollment = await Enrollment.findById(newEnrollmentDoc._id)
      .populate('courseId', 'title thumbnail totalLessons price rating level')
      .catch((e) => {
        logger.error(`enrollCourse: re-fetch populated enrollment failed: ${e?.message}`);
        return null;
      });

    let responseCourse: any = newEnrollment?.courseId ?? null;
    if (responseCourse && responseCourse._id) {
      const liveCount = await Lesson.countDocuments({ courseId: responseCourse._id }).catch((e) => {
        logger.error(`enrollCourse: Lesson.countDocuments failed: ${e?.message}`);
        return Number(responseCourse.totalLessons) || 0;
      });
      const plain = typeof responseCourse.toObject === 'function' ? responseCourse.toObject() : responseCourse;
      responseCourse = { ...plain, totalLessons: liveCount };
    }

    return res.json({
      success: true,
      message: 'Enrolled successfully',
      data: {
        _id: newEnrollment?._id ?? newEnrollmentDoc._id,
        course: responseCourse,
        progress: 0,
        status: 'active',
        academyId: course.academyId || null,
      },
    });
  } catch (err: any) {
    if (err?.code === 11000 && err?.keyPattern?.userId && err?.keyPattern?.courseId) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    next(err);
  }
};

// ─── UPDATE LESSON PROGRESS ─────────────────────────────────────────
export const updateLessonProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser | undefined;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const courseId = toSafeString(req.params?.id, 100);
    const lessonId = toSafeString(req.params?.lessonId, 100);
    if (!isValidObjectId(courseId) || !isValidObjectId(lessonId)) {
      return res.status(400).json({ success: false, message: 'Invalid course or lesson id' });
    }

    const completed = req.body?.completed === true;
    const timeSpentInput = Number(req.body?.timeSpent);
    const timeSpent = Number.isFinite(timeSpentInput) && timeSpentInput > 0 ? timeSpentInput : 0;

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId }).catch((e) => {
      logger.error(`updateLessonProgress: Enrollment lookup failed: ${e?.message}`);
      return null;
    });
    if (!enrollment) return res.status(400).json({ success: false, message: 'Not enrolled' });

    let progress = await LessonProgress.findOne({ enrollmentId: enrollment._id, lessonId }).catch((e) => {
      logger.error(`updateLessonProgress: LessonProgress lookup failed: ${e?.message}`);
      return null;
    });

    if (!progress) {
      progress = new LessonProgress({
        enrollmentId: enrollment._id,
        lessonId,
        completed,
        timeSpent,
      });
    } else {
      if (completed) progress.completed = true;
      progress.timeSpent = (Number(progress.timeSpent) || 0) + timeSpent;
    }

    const lesson = await Lesson.findById(lessonId).catch((e) => {
      logger.error(`updateLessonProgress: Lesson.findById failed: ${e?.message}`);
      return null;
    });

    if (completed && progress.completed && lesson) {
      const durationMinutes = Number(lesson.duration) || 0;
      const requiredMinutes = durationMinutes * 0.8;
      const timeSpentMinutes = (Number(progress.timeSpent) || 0) / 60;
      progress.completed = true;
      if (durationMinutes === 0 || timeSpentMinutes >= requiredMinutes) {
        user.xp = (Number(user.xp) || 0) + (Number(lesson.xpReward) || 50);
        await user.save().catch((e) => logger.error(`updateLessonProgress: user.save (xp) failed: ${e?.message}`));
      }
    }

    await progress.save().catch((e) => {
      logger.error(`updateLessonProgress: progress.save failed: ${e?.message}`);
      throw e; // this one is core to the request's purpose — surface it via next()
    });

    const totalLessons = await Lesson.countDocuments({ courseId: enrollment.courseId }).catch((e) => {
      logger.error(`updateLessonProgress: Lesson.countDocuments failed: ${e?.message}`);
      return 0;
    });
    const completedLessons = await LessonProgress.countDocuments({ enrollmentId: enrollment._id, completed: true }).catch((e) => {
      logger.error(`updateLessonProgress: LessonProgress.countDocuments failed: ${e?.message}`);
      return 0;
    });

    // Guard the division: totalLessons could legitimately be 0 (course
    // with no lessons yet), which would otherwise produce NaN/Infinity.
    enrollment.progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    if (enrollment.progress === 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      user.walletBalance = (Number(user.walletBalance) || 0) + 300;
      await user.save().catch((e) => logger.error(`updateLessonProgress: user.save (bonus) failed: ${e?.message}`));
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: 300,
        status: 'completed',
        description: 'Course completion bonus',
      }).catch((e) => logger.error(`updateLessonProgress: Transaction.create failed: ${e?.message}`));
    }

    await enrollment.save().catch((e) => {
      logger.error(`updateLessonProgress: enrollment.save failed: ${e?.message}`);
      throw e;
    });

    // Challenge auto-completion is a secondary side-effect of lesson
    // progress — wrapped so any failure here never prevents the response
    // above (which already reflects the real, saved progress) from going out.
    try {
      const activeChallenges = await ChallengeProgress.find({
        userId: user._id,
        status: 'enrolled',
      }).populate('challengeId').catch((e) => {
        logger.error(`updateLessonProgress: ChallengeProgress.find failed: ${e?.message}`);
        return [];
      });

      if (lesson && completed && Array.isArray(activeChallenges)) {
        for (const cp of activeChallenges) {
          const challenge = cp?.challengeId as any;
          if (!challenge || !challenge.completionCriteria) continue;
          const progressValue = Number((cp as any).progressValue) || 0;

          if (challenge.completionCriteria.type === 'lessons') {
            const criteriaCourseId = challenge.completionCriteria.courseId?.toString();
            if (criteriaCourseId && lesson.courseId && lesson.courseId.toString() === criteriaCourseId) {
              (cp as any).progressValue = progressValue + 1;
              const newValue = (cp as any).progressValue;
              const target = Number(challenge.completionCriteria.targetCount) || 1;
              cp.progress = Math.min(100, Math.round((newValue / target) * 100));
              await cp.save().catch((e) => logger.error(`updateLessonProgress: cp.save (lessons) failed: ${e?.message}`));
              if (newValue >= target) {
                await completeChallengeAndReward(challenge._id.toString(), user._id.toString(), 'Auto‑completed via lesson progress');
              }
            }
          } else if (challenge.completionCriteria.type === 'xp') {
            const targetXP = Number(challenge.completionCriteria.targetCount) || 0;
            if ((Number(user.xp) || 0) >= targetXP) {
              cp.progress = 100;
              (cp as any).progressValue = targetXP;
              await cp.save().catch((e) => logger.error(`updateLessonProgress: cp.save (xp) failed: ${e?.message}`));
              await completeChallengeAndReward(challenge._id.toString(), user._id.toString(), 'Auto‑completed via XP threshold');
            }
          }
        }
      }
    } catch (challengeErr: any) {
      logger.error(`updateLessonProgress: challenge auto-complete block failed: ${challengeErr?.message}`);
    }

    return res.json({ success: true, data: { progress: enrollment.progress } });
  } catch (err) {
    next(err);
  }
};

// ─── RATE COURSE ──────────────────────────────────────────────────
export const rateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser | undefined;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const courseId = toSafeString(req.params?.id, 100);
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course id' });
    }

    const ratingInput = Number(req.body?.rating);
    if (!Number.isFinite(ratingInput) || ratingInput < 1 || ratingInput > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
    }
    const review = toSafeString(req.body?.review, 2000);

    const course = await Course.findById(courseId).catch((e) => {
      logger.error(`rateCourse: Course.findById failed: ${e?.message}`);
      return null;
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id }).catch((e) => {
      logger.error(`rateCourse: Enrollment lookup failed: ${e?.message}`);
      return null;
    });
    if (!enrollment || enrollment.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Complete the course to rate' });
    }

    const existing = await Rating.findOne({ userId: user._id, courseId: course._id }).catch((e) => {
      logger.error(`rateCourse: Rating lookup failed: ${e?.message}`);
      return null;
    });

    if (existing) {
      existing.rating = ratingInput;
      existing.review = review;
      await existing.save().catch((e) => {
        logger.error(`rateCourse: existing.save failed: ${e?.message}`);
        throw e;
      });
    } else {
      await Rating.create({ userId: user._id, courseId: course._id, rating: ratingInput, review }).catch((e) => {
        logger.error(`rateCourse: Rating.create failed: ${e?.message}`);
        throw e;
      });
    }

    const ratings = await Rating.find({ courseId: course._id }).catch((e) => {
      logger.error(`rateCourse: Rating.find (avg calc) failed: ${e?.message}`);
      return [];
    });
    const safeRatings = Array.isArray(ratings) ? ratings : [];
    // Guard the division: if the ratings list somehow comes back empty
    // right after we just wrote one (race/replication lag), avoid NaN.
    course.avgRating = safeRatings.length > 0
      ? safeRatings.reduce((acc, r: any) => acc + (Number(r.rating) || 0), 0) / safeRatings.length
      : ratingInput;

    await course.save().catch((e) => {
      logger.error(`rateCourse: course.save failed: ${e?.message}`);
      throw e;
    });
    await invalidateCourseCache(course._id.toString());

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ─── TRACK COURSE VIEW ────────────────────────────────────────────
export const trackCourseView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courseId = toSafeString(req.params?.id, 100);
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course id' });
    }

    const course = await Course.findByIdAndUpdate(
      courseId,
      { $inc: { views: 1 } },
      { new: true, select: 'views' }
    ).catch((e) => {
      logger.error(`trackCourseView: findByIdAndUpdate failed: ${e?.message}`);
      throw e;
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Best-effort: a stale cache entry for up to the TTL is an acceptable
    // outcome; failing the whole request over it is not.
    await invalidateCourseCache(courseId);

    return res.json({ success: true, data: { views: Number(course.views) || 0 } });
  } catch (err) {
    next(err);
  }
};

// ─── ASK QUESTION ──────────────────────────────────────────────────
export const askQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser | undefined;
    if (!user?._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const courseId = toSafeString(req.params?.id, 100);
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course id' });
    }

    const question = toSafeString(req.body?.question, 2000).trim();
    if (!question) {
      return res.status(400).json({ success: false, message: 'Question text is required' });
    }

    const lessonIdRaw = req.body?.lessonId;
    const lessonId = isValidObjectId(lessonIdRaw) ? lessonIdRaw : undefined;

    const course = await Course.findById(courseId).catch((e) => {
      logger.error(`askQuestion: Course.findById failed: ${e?.message}`);
      return null;
    });
    if (!course || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const enrollment = await Enrollment.findOne({ userId: user._id, courseId }).catch((e) => {
      logger.error(`askQuestion: Enrollment lookup failed: ${e?.message}`);
      return null;
    });
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'You must be enrolled to ask questions' });
    }

    const newQuestion = await Question.create({
      userId: user._id,
      courseId,
      lessonId,
      question,
    }).catch((e) => {
      logger.error(`askQuestion: Question.create failed: ${e?.message}`);
      throw e;
    });

    return res.status(201).json({ success: true, data: newQuestion });
  } catch (err) {
    next(err);
  }
};
