// src/routes/admin.ts (full replacement)
import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { validatePagination } from '../middleware/validation';
import { auditLog } from '../middleware/audit';

const router = Router();
const adminController = new AdminController();

router.use(authenticate, requireAdmin);
router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', validatePagination, adminController.getUsers);
router.patch('/users/:userId', auditLog('ADMIN_UPDATE_USER', 'User'), adminController.updateUserStatus);
router.get('/courses', validatePagination, adminController.getCourses);
router.post('/courses/:courseId/approve', auditLog('APPROVE_COURSE', 'Course'), adminController.approveCourse);
router.get('/withdrawals', validatePagination, adminController.getWithdrawals);
router.post('/withdrawals/:withdrawalId/process', auditLog('PROCESS_WITHDRAWAL', 'Withdrawal'), adminController.processWithdrawal);
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', auditLog('CREATE_COUPON', 'Coupon'), adminController.createCoupon);
router.delete('/coupons/:couponId', auditLog('DELETE_COUPON', 'Coupon'), adminController.deleteCoupon);
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', auditLog('CREATE_ANNOUNCEMENT', 'Announcement'), adminController.createAnnouncement);
router.get('/audit-logs', validatePagination, adminController.getAuditLogs);

export default router;
