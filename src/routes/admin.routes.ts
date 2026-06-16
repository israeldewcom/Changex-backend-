import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.get('/users/:id/full', adminController.getUserFullDetails); // NEW
router.patch('/users/:id', adminController.updateUserRole);
router.patch('/users/:id/ban', adminController.toggleUserBan);
router.post('/users/:userId/approve-instructor', adminController.approveInstructor);
router.get('/courses', adminController.getAdminCourses);
router.post('/courses/:id/approve', adminController.approveCourse);
router.post('/courses/:id/reject', adminController.rejectCourse);
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:id/process', adminController.processWithdrawal);
router.post('/announcements', adminController.createAnnouncement);
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);
router.get('/announcements/latest', adminController.getPublicAnnouncements);

// Manual payment admin routes
router.get('/manual-payments/pending', adminController.getPendingManualPayments);
router.get('/manual-payments/all', adminController.getAllManualPayments);
router.get('/manual-payments/stats', adminController.getManualPaymentStats);
router.post('/manual-payments/:id/approve', adminController.approveManualPayment);
router.post('/manual-payments/:id/reject', adminController.rejectManualPayment);

// ========== NEW ADMIN ROUTES ==========
// Challenge management
router.post('/challenges', adminController.createChallenge);
router.get('/challenges', adminController.getChallenges);
router.put('/challenges/:id', adminController.updateChallenge);
router.delete('/challenges/:id', adminController.deleteChallenge);

// Ad management
router.post('/ads', adminController.createAd);
router.get('/ads', adminController.getAds);
router.put('/ads/:id', adminController.updateAd);
router.delete('/ads/:id', adminController.deleteAd);
router.get('/ads/placement/:placement', adminController.getActiveAds);

export default router;
