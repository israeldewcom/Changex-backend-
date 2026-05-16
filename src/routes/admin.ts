import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
const adminController = new AdminController();

router.use(authenticate, requireAdmin);

router.get('/dashboard', adminController.getDashboardStats);
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminController.updateUserStatus);
router.get('/courses/pending', adminController.getPendingCourses);
router.get('/courses', adminController.getCourses);
router.post('/courses/:courseId/approve', auditLog('APPROVE_COURSE', 'Course'), adminController.approveCourse);
router.post('/courses/:courseId/reject', auditLog('REJECT_COURSE', 'Course'), adminController.rejectCourse);
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:withdrawalId/process', auditLog('PROCESS_WITHDRAWAL', 'Withdrawal'), adminController.processWithdrawal);
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', adminController.createAnnouncement);
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
