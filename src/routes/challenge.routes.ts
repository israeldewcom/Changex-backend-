import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/active', challengeController.getActiveChallenges);
router.get('/:id', challengeController.getChallengeById);

// Authenticated routes
router.use(authenticate);
router.post('/:challengeId/join', challengeController.joinChallenge);
router.post('/:challengeId/submit', challengeController.submitChallenge);

// Admin only routes
router.use(authorize('admin'));
router.get('/', challengeController.getAllChallenges);
router.post('/', challengeController.createChallenge);
router.put('/:id', challengeController.updateChallenge);
router.delete('/:id', challengeController.deleteChallenge);
router.post('/:challengeId/award', challengeController.awardChallengeWinners);

export default router;
