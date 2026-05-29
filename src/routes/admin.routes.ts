import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.patch('/users/:id', adminController.updateUserRole);
router.post('/users/:userId/approve-instructor', adminController.approveInstructor); // ✅ instructor approval
router.get('/courses', adminController.getAdminCourses);
router.post('/courses/:id/approve', adminController.approveCourse);
router.post('/courses/:id/reject', adminController.rejectCourse);
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:id/process', adminController.processWithdrawal);
router.post('/announcements', adminController.createAnnouncement);
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

export default router;
