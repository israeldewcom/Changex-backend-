import { Router } from 'express';
import { InstructorController } from '../controllers/InstructorController';
import { authenticate, requireCreator } from '../middleware/auth';
import { FileUploadService } from '../services/FileUploadService';
import { auditLog } from '../middleware/audit';

const router = Router();
const instructorController = new InstructorController();
const fileUpload = FileUploadService.getInstance().upload;

router.use(authenticate, requireCreator);

router.get('/dashboard', instructorController.getDashboardStats);
router.post('/courses/:courseId/submit', auditLog('SUBMIT_COURSE', 'Course'), instructorController.submitCourseForApproval);
router.post('/courses/:courseId/media/:type', fileUpload.single('file'), auditLog('UPLOAD_COURSE_MEDIA', 'Course'), instructorController.uploadCourseMedia);
router.get('/courses/:courseId/questions', instructorController.getCourseQuestions);
router.post('/questions/:questionId/answer', instructorController.answerQuestion);

export default router;
