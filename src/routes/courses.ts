import { Router } from 'express';
import { CourseController } from '../controllers/CourseController';
import { authenticate } from '../middleware/auth';

const router = Router();
const courseController = new CourseController();

// Public routes
router.get('/', courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);

// Protected routes
router.use(authenticate);
router.post('/', courseController.createCourse);
router.put('/:id', courseController.updateCourse);
router.post('/:courseId/enroll', courseController.enrollCourse);
router.get('/my/enrollments', courseController.getMyCourses);

export default router;
