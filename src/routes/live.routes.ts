// ============================================================
// FILE: src/routes/live.routes.ts
// ============================================================

import { Router } from 'express';
import {
  createLiveSession,
  getLiveSessions,
  getLiveSession,
  joinLiveSession,
  endLiveSession,
  getRecordings,
} from '../controllers/live.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/sessions', createLiveSession);
router.get('/sessions', getLiveSessions);
router.get('/sessions/:id', getLiveSession);
router.post('/sessions/:id/join', joinLiveSession);
router.post('/sessions/:id/end', endLiveSession);
router.get('/recordings', getRecordings);

export default router;
