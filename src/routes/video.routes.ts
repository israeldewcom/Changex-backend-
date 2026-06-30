// ============================================================
// FILE: src/routes/video.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  createLiveSession,
  getLiveSessions,
  getLiveSession,
  joinLiveSession,
  endLiveSession,
  getRecordings,
  createMeeting,
  getMeetings,
  bookMeeting,
} from '../controllers/video.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

// ─── Live Sessions ────────────────────────────────────────────────────
router.post('/sessions', createLiveSession);
router.get('/sessions', getLiveSessions);
router.get('/sessions/:id', getLiveSession);
router.post('/sessions/:id/join', joinLiveSession);
router.post('/sessions/:id/end', endLiveSession);

// ─── Recordings ─────────────────────────────────────────────────────
router.get('/recordings', getRecordings);

// ─── Meetings ──────────────────────────────────────────────────────
router.post('/meetings', createMeeting);
router.get('/meetings', getMeetings);
router.post('/meetings/:id/book', bookMeeting);

export default router;
