import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.post('/chat', aiController.chat);
router.post('/upload', upload.single('file'), aiController.uploadFileForAnalysis);
router.post('/generate-image', aiController.generateImage); // ✅ NEW
router.delete('/history', aiController.clearHistory); // ✅ NEW

export default router;
