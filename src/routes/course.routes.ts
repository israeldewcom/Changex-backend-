// File: src/routes/course.routes.ts
import { Router } from 'express';
import * as courseController from '../controllers/course.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { cacheResponse } from '../middlewares/cache.js';

const router = Router();

router.get('/', cacheResponse('5 minutes'), courseController.getPublishedCourses);
router.get('/:id', cacheResponse('1 minute'), courseController.getCourse);
router.post('/:id/enroll', authenticate, courseController.enrollCourse);
router.post('/:id/lessons/:lessonId/progress', authenticate, courseController.updateLessonProgress);
router.post('/:id/rate', authenticate, courseController.rateCourse);

export default router;
