// File: src/routes/admin.routes.ts
import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { audit } from '../middlewares/audit.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.patch('/users/:id', audit('update', 'user'), adminController.updateUser);
router.get('/courses', adminController.getCourses);
router.post('/courses/:id/approve', audit('approve', 'course'), adminController.approveCourse);
router.post('/courses/:id/reject', audit('reject', 'course'), adminController.rejectCourse);
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:id/process', audit('process', 'withdrawal'), adminController.processWithdrawal);
router.post('/announcements', audit('create', 'announcement'), adminController.createAnnouncement);
router.post('/coupons', audit('create', 'coupon'), adminController.createCoupon);
router.get('/coupons', adminController.getCoupons);
router.delete('/coupons/:id', audit('delete', 'coupon'), adminController.deleteCoupon);
router.get('/audit-logs', adminController.getAuditLogs);

export default router;
