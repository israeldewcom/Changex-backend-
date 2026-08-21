// ============================================================
// FILE: src/routes/offline.routes.ts
// ============================================================

import { Router } from 'express';
import {
  syncOffline,
  getOfflineProgress,
  getDownloadableLessons,
  saveOfflineData,
} from '../controllers/offline.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/sync', syncOffline);
router.get('/progress', getOfflineProgress);
router.get('/downloadable', getDownloadableLessons);
router.post('/data', saveOfflineData);

export default router;
