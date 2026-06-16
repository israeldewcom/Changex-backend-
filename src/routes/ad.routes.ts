import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

// ========== EXISTING ROUTES ==========
router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.get('/users/:id/full', adminController.getUserFullDetails);
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

// ========== MANUAL PAYMENTS ==========
router.get('/manual-payments/pending', adminController.getPendingManualPayments);
router.get('/manual-payments/all', adminController.getAllManualPayments);
router.get('/manual-payments/stats', adminController.getManualPaymentStats);
router.post('/manual-payments/:id/approve', adminController.approveManualPayment);
router.post('/manual-payments/:id/reject', adminController.rejectManualPayment);

// ========== CHALLENGE MANAGEMENT ==========
router.post('/challenges', adminController.createChallenge);
router.get('/challenges', adminController.getChallenges);
router.put('/challenges/:id', adminController.updateChallenge);
router.delete('/challenges/:id', adminController.deleteChallenge);

// ========== ✅ NEW: CHALLENGE PARTICIPANTS ROUTES ==========
router.get('/challenges/:challengeId/participants', adminController.getChallengeParticipants);
router.put('/challenges/:challengeId/complete/:userId', adminController.completeChallengeForUser);
router.get('/challenges/progress/stats', adminController.getAllChallengeProgressStats);

// ========== AD MANAGEMENT ==========
router.post('/ads', adminController.createAd);
router.get('/ads', adminController.getAds);
router.put('/ads/:id', adminController.updateAd);
router.delete('/ads/:id', adminController.deleteAd);
router.get('/ads/placement/:placement', adminController.getActiveAds);

export default router;
