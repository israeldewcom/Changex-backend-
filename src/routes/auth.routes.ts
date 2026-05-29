import { Router } from 'express';
import * as courseController from '../controllers/course.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/', courseController.getPublishedCourses);
router.get('/my/enrollments', authenticate, courseController.getUserEnrollments); // ✅ NEW
router.get('/:id', courseController.getCourse);
router.post('/:id/enroll', authenticate, courseController.enrollCourse);
router.post('/:id/lessons/:lessonId/progress', authenticate, courseController.updateLessonProgress);
router.post('/:id/rate', authenticate, courseController.rateCourse);

export default router;
