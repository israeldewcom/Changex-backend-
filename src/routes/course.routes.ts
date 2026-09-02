// ============================================================
// FILE: src/routes/course.routes.ts (UPDATED - added academy routes)
// ============================================================

import { Router } from 'express';
import {
  getPublishedCourses,
  getCourse,
  getUserEnrollments,
  enrollCourse,
  updateLessonProgress,
  rateCourse,
  askQuestion,
  trackCourseView,
} from '../controllers/course.controller.js';
import * as certificateController from '../controllers/certificate.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.js';
import { academyAuth } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/', getPublishedCourses);
// optionalAuthenticate (not authenticate) — this route must stay
// reachable by anonymous visitors previewing a course, but also needs
// req.user populated for logged-in, enrolled students so getCourse can
// correctly serve full lesson content instead of the locked preview.
// This was the actual root cause of enrolled students seeing "0 lessons"
// / placeholder lesson text even after paying: with no auth middleware
// at all on this route, req.user was always undefined server-side.
router.get('/:id', optionalAuthenticate, getCourse);
router.post('/:id/view', trackCourseView);

// Protected routes
router.get('/my/enrollments', authenticate, getUserEnrollments);
router.post('/:id/enroll', authenticate, enrollCourse);
router.post('/:id/lessons/:lessonId/progress', authenticate, updateLessonProgress);
router.post('/:id/rate', authenticate, rateCourse);
router.post('/:id/questions', authenticate, askQuestion);

// Certificate download
router.get('/:courseId/certificate/download', authenticate, certificateController.downloadCertificate);

// ─── NEW: Academy-scoped course routes ──────────────────────────────
// Get courses for a specific academy (requires academy membership)
router.get('/academy/:academyId', authenticate, academyAuth(), async (req, res, next) => {
  try {
    // This reuses getPublishedCourses but forces academy filter
    req.query.academyId = (req as any).academyId;
    await getPublishedCourses(req, res, next);
  } catch (err) { next(err); }
});

export default router;
