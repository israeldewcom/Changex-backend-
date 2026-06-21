import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── Public (no auth) ─────────────────────────────────────────────
router.get('/active', challengeController.getActiveChallenges);
router.get('/upcoming', challengeController.getUpcomingChallenges);

// ─── Authenticated user routes ──────────────────────────────────
router.use(authenticate);

// ⚠️  IMPORTANT: specific routes before dynamic :id
router.get('/my-progress', challengeController.getUserChallengeProgress);
router.get('/user/my', challengeController.getUserChallenges);

router.post('/:id/join', challengeController.joinChallenge);
router.get('/:id', challengeController.getChallengeById);

// ─── Admin routes ────────────────────────────────────────────────
router.use(authorize('admin'));
router.post('/', adminController.createChallenge);
router.get('/all', adminController.getChallenges);              // for completed? admin uses this
router.put('/:id', adminController.updateChallenge);
router.delete('/:id', adminController.deleteChallenge);
router.get('/:challengeId/participants', adminController.getChallengeParticipants);
router.put('/:challengeId/complete/:userId', adminController.completeChallengeForUser);
router.get('/progress/stats', adminController.getAllChallengeProgressStats);

export default router;
