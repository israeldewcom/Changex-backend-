import { Router } from 'express';
import { InstructorController } from '../controllers/InstructorController';
import { authenticate, requireCreator } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const instructorController = new InstructorController();
const upload = multer({ storage: multer.memoryStorage() });

// All instructor routes require authentication and creator/premium access
router.use(authenticate, requireCreator);

router.get('/dashboard', instructorController.getDashboardStats);
router.post('/courses/:courseId/submit', instructorController.submitCourseForApproval);
router.post('/courses/:courseId/media/:type', upload.single('file'), instructorController.uploadCourseMedia);

export default router;
