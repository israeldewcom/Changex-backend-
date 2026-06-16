import { Router } from 'express';
import * as challengeController from '../controllers/challenge.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/active', challengeController.getActiveChallenges);
router.get('/upcoming', challengeController.getUpcomingChallenges);
router.get('/:id', challengeController.getChallengeById);

// Authenticated routes
router.use(authenticate);
router.post('/:id/join', challengeController.joinChallenge);
router.get('/user/my', challengeController.getUserChallenges);

// Admin only
router.use(authorize('admin'));
router.post('/', adminController.createChallenge);
router.get('/all', adminController.getChallenges);
router.put('/:id', adminController.updateChallenge);
router.delete('/:id', adminController.deleteChallenge);

export default router;
