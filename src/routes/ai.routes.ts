// File: src/routes/ai.routes.ts
import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.post('/chat', aiController.chat);
router.post('/upload', upload.single('file'), aiController.uploadFileForAnalysis);

export default router;
