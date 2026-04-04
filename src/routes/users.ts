// ============================================
// FILE: src/routes/users.ts (unchanged)
// ============================================
import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/UserController';
import { authenticate } from '../middleware/auth';
import { validateProfileUpdate, validatePagination } from '../middleware/validation';
import { auditLog } from '../middleware/audit';

const router = Router();
const userController = new UserController();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);
router.get('/profile', userController.getProfile);
router.put('/profile', validateProfileUpdate, auditLog('UPDATE_PROFILE', 'User'), userController.updateProfile);
router.post('/avatar', upload.single('avatar'), auditLog('UPLOAD_AVATAR', 'User'), userController.uploadAvatar);
router.get('/wallet', userController.getWallet);
router.get('/referrals', userController.getReferralInfo);
router.get('/notifications', validatePagination, userController.getNotifications);
router.put('/notifications/:notificationId/read', userController.markNotificationRead);
router.put('/notifications/read-all', userController.markAllNotificationsRead);
router.get('/leaderboard', userController.getLeaderboard);
router.get('/dashboard/stats', userController.getDashboardStats);

export default router;
