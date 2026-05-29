// src/routes/user.routes.ts
import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);
router.get('/wallet', userController.getWallet);
router.post('/withdraw', userController.requestWithdrawal);
router.get('/notifications', userController.getNotifications);
router.put('/notifications/:id/read', userController.markNotificationRead);
router.put('/notifications/read-all', userController.markAllNotificationsRead);
router.get('/referrals', userController.getReferrals);
router.get('/leaderboard', userController.getLeaderboard);
router.get('/badges', userController.getUserBadges);
router.post('/claim-welcome-bonus', userController.claimWelcomeBonus);
router.post('/update-premium-status', userController.updatePremiumStatus);

export default router;
