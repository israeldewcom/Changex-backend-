// ============================================================
// FILE: src/routes/ai-advanced.routes.ts
// ============================================================

import { Router } from 'express';
import { advancedChat, generatePractice, evaluateAnswer } from '../controllers/ai-advanced.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/chat', advancedChat);
router.post('/practice', generatePractice);
router.post('/evaluate', evaluateAnswer);

export default router;
