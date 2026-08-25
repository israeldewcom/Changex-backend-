// ============================================================
// FILE: src/routes/group.routes.ts (COMPLETE FIXED)
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
import {
  createGroupPost,
  getGroupPosts,
  deleteGroupPost,
  commentOnPost,
  likePost,
} from '../controllers/group-post.controller.js';
import {
  banMember,
  unbanMember,
  muteMember,
  reportContent,
  reviewReport,
  getPendingReports,
} from '../controllers/group-moderation.controller.js';
import {
  getGroupAnalytics,
} from '../controllers/group-analytics.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

// ─── Group CRUD ──────────────────────────────────────
router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:id', getGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

// ─── Membership ──────────────────────────────────────
router.post('/:id/join', joinGroup);
router.post('/:id/leave', leaveGroup);

// ─── Resources ──────────────────────────────────────
router.post('/:id/resources', addResource);
router.get('/:id/resources', getResources);

// ─── Events ──────────────────────────────────────────
router.post('/:id/events', createEvent);
router.get('/:id/events', getEvents);

// ─── Posts & Comments ───────────────────────────────
router.post('/:groupId/posts', createGroupPost);
router.get('/:groupId/posts', getGroupPosts);
router.delete('/posts/:postId', deleteGroupPost);
router.post('/posts/:postId/comments', commentOnPost);
router.post('/posts/:postId/like', likePost);

// ─── Moderation ──────────────────────────────────────
router.post('/:groupId/ban/:userId', banMember);
router.post('/:groupId/unban/:userId', unbanMember);
router.post('/:groupId/mute/:userId', muteMember);
router.post('/:groupId/report', reportContent);
router.get('/:groupId/reports/pending', getPendingReports);
router.put('/reports/:reportId/review', reviewReport);

// ─── Analytics ──────────────────────────────────────
router.get('/:groupId/analytics', getGroupAnalytics);

export default router;
