// ============================================================
// FILE: src/routes/admin.routes.ts
// COMPLETE UPDATED VERSION – all admin endpoints
// ============================================================

import { Router } from 'express';
import {
    // Dashboard
    getDashboard,

    // User Management
    getUsers,
    getUserById,
    getUserFullDetails,
    getUserPosts,
    updateUserRole,
    toggleUserBan,
    approveInstructor,

    // Course Management
    getAdminCourses,
    getCourseDetails,
    approveCourse,
    rejectCourse,

    // Withdrawals
    getWithdrawals,
    processWithdrawal,

    // Manual Payments
    getPendingManualPayments,
    getAllManualPayments,
    getManualPaymentStats,
    getManualPaymentById,
    approveManualPayment,
    rejectManualPayment,

    // Announcements
    createAnnouncement,
    getAnnouncements,
    deleteAnnouncement,
    getPublicAnnouncements,

    // Coupons
    getCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,

    // Challenges
    createChallenge,
    getChallenges,
    updateChallenge,
    deleteChallenge,
    joinChallenge,
    getChallengeParticipants,
    completeChallengeForUser,
    getAllChallengeProgressStats,

    // Ads
    createAd,
    getAds,
    updateAd,
    deleteAd,
    trackAdImpression,
    trackAdClick,
    getActiveAds,

    // Social Earnings
    getSocialEarningsConfig,
    updateSocialEarningsConfig,
    getTopEarningPosts,
    getTotalSocialEarningsPool,
    triggerSocialEarnings,

    // Books (Admin CRUD)
    createBook,
    updateBook,
    deleteBook,

    // File uploads
    uploadImage,
    uploadFile,

} from '../controllers/admin.controller.js';

import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── All admin routes require authentication and admin role ──────────
router.use(authenticate, authorize('admin'));

// ==================== DASHBOARD ====================
router.get('/dashboard', getDashboard);

// ==================== USER MANAGEMENT ====================
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.get('/users/:userId/full', getUserFullDetails);
router.get('/users/:userId/posts', getUserPosts);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/ban', toggleUserBan);
router.post('/users/:userId/approve-instructor', approveInstructor);

// ==================== COURSE MANAGEMENT ====================
router.get('/courses', getAdminCourses);
router.get('/courses/:id', getCourseDetails);
router.post('/courses/:id/approve', approveCourse);
router.post('/courses/:id/reject', rejectCourse);

// ==================== WITHDRAWALS ====================
router.get('/withdrawals', getWithdrawals);
router.post('/withdrawals/:id/process', processWithdrawal);

// ==================== MANUAL PAYMENTS ====================
router.get('/manual-payments/pending', getPendingManualPayments);
router.get('/manual-payments/all', getAllManualPayments);
router.get('/manual-payments/stats', getManualPaymentStats);
router.get('/manual-payments/:id', getManualPaymentById);
router.post('/manual-payments/:id/approve', approveManualPayment);
router.post('/manual-payments/:id/reject', rejectManualPayment);

// ==================== ANNOUNCEMENTS ====================
router.post('/announcements', createAnnouncement);
router.get('/announcements', getAnnouncements);
router.delete('/announcements/:id', deleteAnnouncement);
router.get('/announcements/public/latest', getPublicAnnouncements);

// ==================== COUPONS ====================
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

// ==================== CHALLENGES ====================
router.post('/challenges', createChallenge);
router.get('/challenges', getChallenges);
router.put('/challenges/:id', updateChallenge);
router.delete('/challenges/:id', deleteChallenge);
router.post('/challenges/:id/join', joinChallenge);
router.get('/challenges/:challengeId/participants', getChallengeParticipants);
router.put('/challenges/:challengeId/complete/:userId', completeChallengeForUser);
router.get('/challenges/progress/stats', getAllChallengeProgressStats);

// ==================== ADS ====================
router.post('/ads', createAd);
router.get('/ads', getAds);
router.put('/ads/:id', updateAd);
router.delete('/ads/:id', deleteAd);
router.post('/ads/:id/impression', trackAdImpression);
router.post('/ads/:id/click', trackAdClick);
router.get('/ads/placement/:placement', getActiveAds); // public, but admin can also list

// ==================== SOCIAL EARNINGS ====================
router.get('/social-earnings/config', getSocialEarningsConfig);
router.put('/social-earnings/config', updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', getTopEarningPosts);
router.get('/social-earnings/total-pool', getTotalSocialEarningsPool);
router.post('/social-earnings/trigger', triggerSocialEarnings);

// ==================== BOOKS (Admin CRUD) ====================
router.post('/books', createBook);
router.put('/books/:id', updateBook);
router.delete('/books/:id', deleteBook);

// ==================== FILE UPLOADS ====================
router.post('/upload', upload.single('image'), uploadImage);
router.post('/upload-file', upload.single('file'), uploadFile);

// ==================== AUDIT LOGS (placeholder) ====================
// router.get('/audit-logs', getAuditLogs);

export default router;
