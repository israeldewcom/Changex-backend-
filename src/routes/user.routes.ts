// ============================================================
// FILE: src/routes/user.routes.ts (COMPLETE – with push & notification prefs)
// ============================================================

import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import * as adController from '../controllers/ad.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── PUBLIC ROUTES (no auth) ──────────────────────────────────────────
router.get('/leaderboard', userController.getLeaderboard);

// ─── AUTHENTICATED ROUTES ─────────────────────────────────────────────
router.use(authenticate);

// ─── Profile ──────────────────────────────────────────────────────────
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.post('/avatar', upload.single('avatar'), userController.uploadAvatar);

// ─── Wallet ───────────────────────────────────────────────────────────
router.get('/wallet', userController.getWallet);
router.post('/withdraw', userController.requestWithdrawal);

// ─── Ad Earnings ──────────────────────────────────────────────────────
router.get('/ad-earnings', adController.getUserAdEarnings);

// ─── Notifications ────────────────────────────────────────────────────
router.get('/notifications', userController.getNotifications);
router.put('/notifications/:id/read', userController.markNotificationRead);
router.put('/notifications/read-all', userController.markAllNotificationsRead);

// ─── Push Subscription ────────────────────────────────────────────────
router.post('/push-subscription', notificationController.registerPushSubscription);

// ─── Notification Preferences ────────────────────────────────────────
router.put('/notification-preferences', notificationController.updateNotificationPreferences);
router.get('/notification-preferences', notificationController.getNotificationPreferences);

// ─── Referrals ────────────────────────────────────────────────────────
router.get('/referrals', userController.getReferrals);

// ─── Badges ───────────────────────────────────────────────────────────
router.get('/badges', userController.getUserBadges);

// ─── Welcome Bonus ────────────────────────────────────────────────────
router.post('/claim-welcome-bonus', userController.claimWelcomeBonus);

// ─── Premium Status ──────────────────────────────────────────────────
router.post('/update-premium-status', userController.updatePremiumStatus);

// ─── Tier ────────────────────────────────────────────────────────────
router.get('/tier', userController.getTier);

// ─── Public Profile ──────────────────────────────────────────────────
router.get('/:userId/profile', userController.getUserProfile);

export default router;
