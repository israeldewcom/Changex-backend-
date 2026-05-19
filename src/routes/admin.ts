// ============================================
// FILE: src/routes/admin.ts (existing + announcements route)
// ============================================
import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

router.use(authenticate, requireAdmin);
router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminController.updateUserStatus);
router.get('/courses/pending', adminController.getPendingCourses);
router.get('/courses', adminController.getAllCourses);
router.get('/courses/:courseId', adminController.getCourseById);
router.post('/courses/:courseId/approve', adminController.approveCourse);
router.post('/courses/:courseId/reject', adminController.rejectCourse);
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);
router.get('/withdrawals', adminController.getAllWithdrawals);
router.get('/withdrawals/:withdrawalId', adminController.getWithdrawalById);
router.post('/withdrawals/:withdrawalId/process', adminController.processWithdrawal);
router.get('/coupons', adminController.getCoupons);
router.get('/coupons/:couponId', adminController.getCouponById);
router.post('/coupons', adminController.createCoupon);
router.put('/coupons/:couponId', adminController.updateCoupon);
router.delete('/coupons/:couponId', adminController.deleteCoupon);
router.get('/announcements', adminController.getAnnouncements);          // ADDED
router.post('/announcements', adminController.createAnnouncement);
router.post('/announcements/:announcementId/send', adminController.sendAnnouncementToAll);
router.delete('/announcements/:announcementId', adminController.deleteAnnouncement);
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/platform/stats', adminController.getPlatformStatistics);
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

export default router;
