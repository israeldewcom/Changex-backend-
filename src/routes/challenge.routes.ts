import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ========== PUBLIC ROUTES (order matters: specific before generic) ==========
router.get('/active', challengeController.getActiveChallenges);
router.get('/upcoming', challengeController.getUpcomingChallenges);

// ========== ADMIN ROUTES (must come BEFORE /:id) ==========
router.get('/all', authenticate, authorize('admin'), adminController.getChallenges);

// ========== GENERIC ID ROUTE (must be LAST) ==========
router.get('/:id', challengeController.getChallengeById);

// ========== AUTHENTICATED USER ROUTES ==========
router.use(authenticate);
router.post('/:id/join', challengeController.joinChallenge);
router.get('/user/my', challengeController.getUserChallenges);
router.get('/my-progress', challengeController.getUserChallengeProgress);

// ========== ADMIN ONLY (management) ==========
router.post('/', authenticate, authorize('admin'), adminController.createChallenge);
router.put('/:id', authenticate, authorize('admin'), adminController.updateChallenge);
router.delete('/:id', authenticate, authorize('admin'), adminController.deleteChallenge);

// ========== ADMIN CHALLENGE PARTICIPANTS ==========
router.get('/:challengeId/participants', authenticate, authorize('admin'), adminController.getChallengeParticipants);
router.put('/:challengeId/complete/:userId', authenticate, authorize('admin'), adminController.completeChallengeForUser);
router.get('/progress/stats', authenticate, authorize('admin'), adminController.getAllChallengeProgressStats);

export default router;
