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
} from '../controllers/course.controller.js';
import * as certificateController from '../controllers/certificate.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { academyAuth } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/', getPublishedCourses);
router.get('/:id', getCourse);

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
