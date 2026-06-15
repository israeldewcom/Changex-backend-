import { Router } from 'express';
import * as followController from '../controllers/follow.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/:userId/follow', followController.followUser);
router.delete('/:userId/unfollow', followController.unfollowUser);
router.get('/:userId/followers', followController.getFollowers);
router.get('/:userId/following', followController.getFollowing);
router.get('/:userId/stats', followController.getFollowStats);

export default router;
