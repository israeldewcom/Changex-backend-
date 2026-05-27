import { Router } from 'express';
import * as instructorController from '../controllers/instructor.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.use(authorize('instructor', 'admin'));

router.get('/dashboard', instructorController.getInstructorDashboard);
router.get('/courses/:courseId/analytics', instructorController.getCourseAnalytics);
router.post('/courses', instructorController.createCourse);
router.put('/courses/:id', instructorController.updateCourse);
router.post('/courses/:id/submit', instructorController.submitForReview);
router.post('/media/upload', upload.single('file'), instructorController.uploadCourseMedia);
router.post('/courses/:courseId/lessons', instructorController.createLesson);
router.put('/lessons/:lessonId', instructorController.updateLesson);
router.delete('/lessons/:lessonId', instructorController.deleteLesson);
router.put('/courses/:courseId/reorder', instructorController.reorderLessons);

export default router;
