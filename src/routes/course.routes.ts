// ============================================================
// FILE: src/routes/course.routes.ts
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
import * as certificateController from '../controllers/certificate.controller.js'; // ✅ imported
import { authenticate } from '../middlewares/auth.js';

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

// ✅ FIXED: Certificate download – parameter name matches controller
router.get('/:courseId/certificate/download', authenticate, certificateController.downloadCertificate);

export default router;
