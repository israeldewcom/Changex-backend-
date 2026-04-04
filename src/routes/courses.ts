// ============================================
// FILE: src/routes/courses.ts (unchanged)
// ============================================
import { Router } from 'express';
import { CourseController } from '../controllers/CourseController';
import { authenticate, requireCreator } from '../middleware/auth';
import { validateCourseCreation, validateCourseUpdate, validateEnrollment, validateLessonProgress, validatePagination, validateSearch } from '../middleware/validation';
import { auditLog } from '../middleware/audit';

const router = Router();
const courseController = new CourseController();

router.get('/', validatePagination, validateSearch, courseController.getAllCourses);
router.get('/:id', courseController.getCourseById);
router.get('/:id/reviews', courseController.getCourseReviews);
router.use(authenticate);
router.post('/', requireCreator, validateCourseCreation, auditLog('CREATE_COURSE', 'Course'), courseController.createCourse);
router.put('/:id', requireCreator, validateCourseUpdate, auditLog('UPDATE_COURSE', 'Course'), courseController.updateCourse);
router.post('/:courseId/enroll', validateEnrollment, auditLog('ENROLL_COURSE', 'Course'), courseController.enrollCourse);
router.get('/my/enrollments', courseController.getMyCourses);
router.get('/:courseId/progress', courseController.getCourseProgress);
router.post('/:courseId/lessons/:lessonId/progress', validateLessonProgress, auditLog('UPDATE_LESSON_PROGRESS', 'Lesson'), courseController.updateLessonProgress);

export default router;
