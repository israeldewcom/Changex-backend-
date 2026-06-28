// ============================================================
// FILE: src/routes/course.routes.ts (already correct)
// ============================================================

import { Router } from 'express';
import {
  getPublishedCourses,
  getCourse,
  getUserEnrollments,
  enrollCourse,
  updateLessonProgress,
  rateCourse,
} from '../controllers/course.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// Public routes (some may still need auth for enrollment, etc.)
router.get('/', getPublishedCourses);
router.get('/:id', getCourse); // ✅ This now handles both _id and slug

// Protected routes
router.get('/my/enrollments', authenticate, getUserEnrollments);
router.post('/:id/enroll', authenticate, enrollCourse);
router.post('/:id/lessons/:lessonId/progress', authenticate, updateLessonProgress);
router.post('/:id/rate', authenticate, rateCourse);

export default router;
