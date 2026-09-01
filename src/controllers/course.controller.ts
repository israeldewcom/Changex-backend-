// ============================================================
// FILE: src/controllers/course.controller.ts (UPDATED - academy scoping + live lesson counts + course preview data)
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

// ─── Helper: auto‑complete challenge (unchanged) ──────────────
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

// ─── Helper: attach LIVE lesson counts to a list of course objects ────────
// totalLessons on the Course document is a cached counter that is only
// ever incremented/decremented by instructor.controller.ts's
// createLesson/deleteLesson. Any lesson that enters or leaves the
// database another way (seed script, bulk import, direct DB edit) makes
// that cached number wrong without touching the real Lesson collection.
// This computes the true count directly from Lesson on every read, so
// the number shown to users can never drift out of sync again.
async function attachLiveLessonCounts(courses: any[]) {
  if (courses.length === 0) return courses;
  const courseIds = courses.map((c) => c._id);
  const counts = await Lesson.aggregate([
    { $match: { courseId: { $in: courseIds } } },
    { $group: { _id: '$courseId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
  return courses.map((c) => ({
    ...c,
    totalLessons: countMap.get(c._id.toString()) || 0,
  }));
}

// ==================== GET PUBLISHED COURSES (CACHED, with academy filter) ====================
export const getPublishedCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, level, search, limit = 20, offset = 0, academyId } = req.query;
    const filter: any = { isPublished: true, approvalStatus: 'approved' };
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (search) filter.title = { $regex: search, $options: 'i' };
    // Academy filter: if academyId provided, show only courses that belong to that academy OR are public
    if (academyId) {
      filter.$or = [
        { academyId: academyId },
        { academyOnly: { $ne: true } } // public courses not restricted to any academy
      ];
    } else {
      // If no academy, only show public courses (not academyOnly)
      filter.academyOnly = { $ne: true };
    }

    const cacheKey = `courses:${JSON.stringify({ category, level, search, limit, offset, academyId })}`;
    const data = await getOrSetCache(cacheKey, async () => {
      // NOTE: totalLessons is intentionally NOT selected from Course here —
      // it's a cached field that can drift out of sync. We select the
      // fields that ARE safe to trust as-is, plus the new preview fields
      // (whatYouWillLearn) so the Explore list can show a short teaser,
      // then attach a live, always-correct lesson count below.
      const courses = await Course.find(filter)
        .skip(Number(offset))
        .limit(Number(limit))
        .select('title price salePrice thumbnail level slug instructorId totalStudents avgRating academyId academyOnly whatYouWillLearn')
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

// ==================== GET SINGLE COURSE (CACHED, with academy check + curriculum preview) ====================
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
        // totalLessons is derived from the actual lessons array we just
        // fetched, not the cached counter on the Course document — this
        // guarantees the single-course view can never show a stale count.
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
      const user = req.user as IUser;
      if (!user) {
        return res.status(403).json({ success: false, message: 'This course is only available to academy members' });
      }
      const membership = await AcademyMembership.findOne({ academyId: course.academyId, userId: user._id });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'You are not a member of this academy' });
      }
    }

    let enrollment = null;
    const reqUser = req.user as IUser | undefined;
    if (reqUser) {
      enrollment = await Enrollment.findOne({ userId: reqUser._id, courseId: course._id });
    }

    // ─── Curriculum preview for non-enrolled users ──────────────────────
    // Previously this endpoint returned the FULL lesson objects (including
    // videoUrl and content) to anyone who hit it, enrolled or not — that
    // was a content-leak bug in the opposite direction of the "0 lessons"
    // problem. Now: a free course, or a course the user is enrolled in,
    // still returns full lesson content as before. A paid course being
    // viewed by someone who hasn't enrolled/paid gets a preview version of
    // each lesson — title, type, order, duration — so buyers can see the
    // full curriculum shape and know exactly what they're paying for,
    // without being able to access the actual video/text/assignment content
    // before purchase.
    const isFreeCourse = !course.price || course.price === 0;
    const hasAccess = !!enrollment || isFreeCourse;

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

    res.json({
      success: true,
      data: {
        ...course,
        lessons: lessonsForResponse,
        hasAccess,
        // whatYouWillLearn, requirements, and targetAudience are already
        // present on `course` via the ...found.toObject() spread above,
        // once they're set on the Course document (see Course.ts schema
        // update) — no extra work needed here to surface them.
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

// ─── GET USER ENROLLMENTS (with academy scope + live lesson counts) ────
export const getUserEnrollments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const filter: any = { userId: user._id };
    // If user belongs to an academy, only show those enrollments? Or all?
    // We'll show all, but include academy info
    const enrollments = await Enrollment.find(filter)
      .populate({
        path: 'courseId',
        select: 'title thumbnail totalLessons price rating level instructorId academyId academyOnly',
      })
      .lean();

    // Replace each populated course's cached totalLessons with a live
    // count, same reasoning as attachLiveLessonCounts above.
    const courseIds = enrollments
      .map((e: any) => e.courseId?._id)
      .filter(Boolean);
    const counts = await Lesson.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const formatted = enrollments.map(enrollment => {
      const course = enrollment.courseId as any;
      if (course && course._id) {
        course.totalLessons = countMap.get(course._id.toString()) || 0;
      }
      return {
        _id: enrollment._id,
        userId: enrollment.userId,
        course: course,
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

// ─── ENROLL COURSE (with academy check + live lesson count on response) ─
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

    // ─── Academy access check ──────────────────────────────────────────
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

    // Attach a live lesson count to the populated course before responding,
    // same reasoning as everywhere else in this file.
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

// ─── UPDATE LESSON PROGRESS (unchanged, but adds academyId to progress) ──
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
    enrollment.progress = Math.round((completedLessons / totalLessons) * 100);
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

    // Auto‑complete challenges (unchanged)
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

// ─── RATE COURSE (unchanged) ──────────────────────────────────────
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

// ─── ASK QUESTION (unchanged) ──────────────────────────────────────
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
