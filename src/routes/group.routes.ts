// ============================================================
// FILE: src/routes/group.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  createGroup,
  getGroups,
  getGroup,
  joinGroup,
  leaveGroup,
  updateGroup,
  deleteGroup,
  addResource,
  getResources,
  createEvent,
  getEvents,
} from '../controllers/group.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:id', getGroup);
router.post('/:id/join', joinGroup);
router.post('/:id/leave', leaveGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

// ─── Resources ──────────────────────────────────────────────────────
router.post('/:id/resources', addResource);
router.get('/:id/resources', getResources);

// ─── Events ────────────────────────────────────────────────────────
router.post('/:id/events', createEvent);
router.get('/:id/events', getEvents);

export default router;
