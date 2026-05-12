import { Router } from 'express';
import { CourseController } from '../controllers/CourseController';
import { authenticate, requireCreator } from '../middleware/auth';
import {
  validateCourseCreation,
  validateCourseUpdate,
  validateEnrollment,
  validateLessonProgress,
  validatePagination,
  validateSearch,
} from '../middleware/validation';
import { auditLog } from '../middleware/audit';

const router = Router();
const courseController = new CourseController();

// Public routes (no authentication)
router.get('/', validatePagination, validateSearch, courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);
router.get('/:id/reviews', courseController.getCourseReviews);

// All routes below require authentication
router.use(authenticate);

// My enrolled courses
router.get('/my/enrollments', courseController.getMyCourses);

// Course creation & update
router.post('/', requireCreator, validateCourseCreation, auditLog('CREATE_COURSE', 'Course'), courseController.createCourse);
router.put('/:id', requireCreator, validateCourseUpdate, auditLog('UPDATE_COURSE', 'Course'), courseController.updateCourse);

// Enrollment
router.post('/:courseId/enroll', validateEnrollment, auditLog('ENROLL_COURSE', 'Course'), courseController.enrollCourse);

// Progress
router.get('/:courseId/progress', courseController.getCourseProgress);
router.post('/:courseId/lessons/:lessonId/progress', validateLessonProgress, auditLog('UPDATE_LESSON_PROGRESS', 'Lesson'), courseController.updateLessonProgress);

// Rating
router.post('/:id/rate', courseController.rateCourse);

// Q&A
router.get('/:id/questions', courseController.getCourseQuestions);
router.post('/:id/questions', courseController.askQuestion);

export default router;
