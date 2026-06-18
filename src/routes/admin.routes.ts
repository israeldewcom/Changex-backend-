// ============================================================
// FILE: src/routes/admin.routes.ts
// ============================================================

import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// ===== DASHBOARD =====
router.get('/dashboard', adminController.getDashboard);

// ===== USERS =====
router.get('/users', adminController.getUsers);
router.get('/users/:id/full', adminController.getUserFullDetails);
router.patch('/users/:id', adminController.updateUserRole);
router.patch('/users/:id/ban', adminController.toggleUserBan);
router.post('/users/:userId/approve-instructor', adminController.approveInstructor);

// ===== COURSES =====
router.get('/courses', adminController.getAdminCourses);
router.post('/courses/:id/approve', adminController.approveCourse);
router.post('/courses/:id/reject', adminController.rejectCourse);

// ===== WITHDRAWALS =====
router.get('/withdrawals', adminController.getWithdrawals);
router.post('/withdrawals/:id/process', adminController.processWithdrawal);

// ===== ANNOUNCEMENTS =====
router.post('/announcements', adminController.createAnnouncement);
router.get('/announcements', adminController.getAnnouncements);
router.delete('/announcements/:id', adminController.deleteAnnouncement);
router.get('/announcements/latest', adminController.getPublicAnnouncements); // public, but kept for admin

// ===== COUPONS =====
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.put('/coupons/:id', adminController.updateCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

// ===== MANUAL PAYMENTS =====
router.get('/manual-payments/pending', adminController.getPendingManualPayments);
router.get('/manual-payments/all', adminController.getAllManualPayments);
router.get('/manual-payments/stats', adminController.getManualPaymentStats);
router.get('/manual-payments/:id', adminController.getManualPaymentById);
router.post('/manual-payments/:id/approve', adminController.approveManualPayment);
router.post('/manual-payments/:id/reject', adminController.rejectManualPayment);

// ===== CHALLENGES =====
router.post('/challenges', adminController.createChallenge);
router.get('/challenges', adminController.getChallenges);
router.put('/challenges/:id', adminController.updateChallenge);
router.delete('/challenges/:id', adminController.deleteChallenge);
router.get('/challenges/:challengeId/participants', adminController.getChallengeParticipants);
router.put('/challenges/:challengeId/complete/:userId', adminController.completeChallengeForUser);
router.get('/challenges/progress/stats', adminController.getAllChallengeProgressStats);

// ===== ADS =====
router.post('/ads', adminController.createAd);
router.get('/ads', adminController.getAds);
router.put('/ads/:id', adminController.updateAd);
router.delete('/ads/:id', adminController.deleteAd);
// Public routes for ad serving are defined elsewhere, but admin can also see
router.get('/ads/placement/:placement', adminController.getActiveAds);

// ===== SOCIAL EARNINGS =====
router.get('/social-earnings/config', adminController.getSocialEarningsConfig);
router.put('/social-earnings/config', adminController.updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', adminController.getTopEarningPosts);
router.get('/social-earnings/total-pool', adminController.getTotalSocialEarningsPool);
// Manual trigger for social earnings distribution (admin only)
router.post('/social-earnings/trigger', adminController.triggerSocialEarnings);

export default router;
