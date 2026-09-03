import { Router } from 'express';
import * as instructorController from '../controllers/instructor.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { uploadMemory } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.use(authorize('instructor', 'admin'));

router.get('/dashboard', instructorController.getInstructorDashboard);
router.post('/courses', instructorController.createCourse);
router.put('/courses/:id', instructorController.updateCourse);
router.delete('/courses/:id', instructorController.deleteCourse); // ✅ NEW
router.post('/courses/:id/draft', instructorController.saveDraft);
router.post('/courses/:id/submit', instructorController.submitForReview);
router.post('/courses/:courseId/lessons', instructorController.createLesson);
router.put('/courses/:courseId/lessons/:lessonId', instructorController.updateLesson);
router.delete('/courses/:courseId/lessons/:lessonId', instructorController.deleteLesson);
router.post('/courses/:courseId/media/resource', uploadMemory.single('file'), instructorController.uploadMedia);
router.get('/courses/:courseId/questions', instructorController.getCourseQuestions);
router.post('/questions/:id/answer', instructorController.answerQuestion);
router.post('/courses/:courseId/certificate-template', uploadMemory.single('template'), instructorController.uploadCertificateTemplate);
router.post('/courses/:courseId/thumbnail', uploadMemory.single('thumbnail'), instructorController.uploadCourseThumbnail);
router.post('/courses/:courseId/lessons/:lessonId/image', uploadMemory.single('image'), instructorController.uploadLessonImage);

export default router;
