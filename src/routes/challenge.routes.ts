import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── Public routes (no auth) ──────────────────────────────────────────
router.get('/active', challengeController.getActiveChallenges);
router.get('/upcoming', challengeController.getUpcomingChallenges);

// ─── Authenticated user routes ──────────────────────────────────────
router.use(authenticate);

// ⚠️  SPECIFIC routes MUST come BEFORE the generic /:id
router.get('/all', authorize('admin'), adminController.getChallenges);   // ✅ now before /:id
router.get('/my-progress', challengeController.getUserChallengeProgress);
router.get('/user/my', challengeController.getUserChallenges);
router.post('/:id/join', challengeController.joinChallenge);

// ─── Generic ID route (must be LAST) ──────────────────────────────────
router.get('/:id', challengeController.getChallengeById);

// ─── Admin only ──────────────────────────────────────────────────────
router.use(authorize('admin'));
router.post('/', adminController.createChallenge);
router.put('/:id', adminController.updateChallenge);
router.delete('/:id', adminController.deleteChallenge);
router.get('/:challengeId/participants', adminController.getChallengeParticipants);
router.put('/:challengeId/complete/:userId', adminController.completeChallengeForUser);
router.get('/progress/stats', adminController.getAllChallengeProgressStats);

export default router;
