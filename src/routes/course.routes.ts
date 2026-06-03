import { Router } from 'express';
import * as courseController from '../controllers/course.controller.js';
import * as certificateController from '../controllers/certificate.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/', courseController.getPublishedCourses);
router.get('/:id', courseController.getCourse);
router.get('/my/enrollments', authenticate, courseController.getUserEnrollments);
router.post('/:id/enroll', authenticate, courseController.enrollCourse);
router.post('/:id/lessons/:lessonId/progress', authenticate, courseController.updateLessonProgress);
router.post('/:id/rate', authenticate, courseController.rateCourse);
router.get('/:courseId/certificate/download', authenticate, certificateController.downloadCertificate);

export default router;
