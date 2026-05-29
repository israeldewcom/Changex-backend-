import { Router } from 'express';
import { submitFeedback } from '../controllers/feedback.controller.js';

const router = Router();

router.post('/', submitFeedback);

export default router;
