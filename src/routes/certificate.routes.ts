import { Router } from 'express';
import * as certificateController from '../controllers/certificate.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All certificate routes require authentication
router.use(authenticate);

// Download certificate for a completed course
router.get('/download/:courseId', certificateController.downloadCertificate);

// Check if certificate is available (without downloading)
router.get('/check/:courseId', certificateController.checkCertificateAvailability);

export default router;
