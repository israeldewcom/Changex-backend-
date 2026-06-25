import { Router } from 'express';
import * as followController from '../controllers/follow.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All follow routes require authentication
router.use(authenticate);

router.post('/:userId/follow', followController.followUser);
router.get('/:userId/followers', followController.getFollowers);
router.get('/:userId/following', followController.getFollowing);
router.get('/:userId/stats', followController.getFollowStats);
router.get('/:userId/status', followController.checkFollowStatus);

export default router;
