import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();
const ctrl = new AdminController();

router.use(authenticate, requireAdmin);

router.get('/dashboard', ctrl.getDashboardStats);
router.get('/users', ctrl.getUsers);
router.patch('/users/:userId', ctrl.updateUserStatus);
router.get('/courses', ctrl.getCourses);
router.post('/courses/:courseId/approve', ctrl.approveCourse);
router.get('/withdrawals', ctrl.getWithdrawals);
router.post('/withdrawals/:withdrawalId/process', ctrl.processWithdrawal);
router.get('/coupons', ctrl.getCoupons);
router.post('/coupons', ctrl.createCoupon);
router.delete('/coupons/:couponId', ctrl.deleteCoupon);
router.get('/announcements', ctrl.getAnnouncements);
router.post('/announcements', ctrl.createAnnouncement);
router.get('/audit-logs', ctrl.getAuditLogs);

export default router;
