import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { auditLog } from '../middleware/audit';

const router = Router();
const adminController = new AdminController();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Users
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminController.updateUserStatus);

// Course approvals
router.get('/courses/pending', adminController.getPendingCourses);
router.post('/courses/:courseId/approve', auditLog('APPROVE_COURSE', 'Course'), adminController.approveCourse);
router.post('/courses/:courseId/reject', auditLog('REJECT_COURSE', 'Course'), adminController.rejectCourse);

// Withdrawals
router.get('/withdrawals/pending', adminController.getPendingWithdrawals);
router.post('/withdrawals/:withdrawalId/process', auditLog('PROCESS_WITHDRAWAL', 'Withdrawal'), adminController.processWithdrawal);

// Coupons
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

// Announcements
router.get('/announcements', adminController.getAnnouncements);
router.post('/announcements', adminController.createAnnouncement);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
