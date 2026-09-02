// ============================================================
// FILE: src/routes/admin.routes.ts (WITH BOOK APPROVE/REJECT ROUTES)
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

    // Books (Admin CRUD + Approval)
    createBook,
    updateBook,
    deleteBook,
    getAdminBooks,
    approveBook,
    rejectBook,
    getPendingBooks,

    // File uploads
    uploadImage,
    uploadFile,

    // Platform Stats
    getPlatformStats,

    // Admin Post Management
    deletePostByAdmin,

} from '../controllers/admin.controller.js';

// ─── Article Admin Controllers ─────────────────────────────────
import {
    approveArticle,
    rejectArticle,
    getAdminArticles,
    getArticleStats,
} from '../controllers/article.controller.js';

// ─── Campaign Admin Controllers ──────────────────────────────
import {
    approveCampaign,
    rejectCampaign,
    adminGetCampaigns,
    adminGetCampaign,
    verifyManualPayment,
    refundCampaign,
} from '../controllers/campaign.controller.js';

// ─── Revenue Analytics ─────────────────────────────────────────
import { getRevenueAnalytics } from '../controllers/analytics.controller.js';

// ─── Cache management ──────────────────────────────────────────
import { clearCourseCache } from '../controllers/admin.controller.js';

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
router.get('/ads/placement/:placement', getActiveAds);

// ==================== SOCIAL EARNINGS ====================
router.get('/social-earnings/config', getSocialEarningsConfig);
router.put('/social-earnings/config', updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', getTopEarningPosts);
router.get('/social-earnings/total-pool', getTotalSocialEarningsPool);
router.post('/social-earnings/trigger', triggerSocialEarnings);

// ==================== BOOKS (Admin CRUD + Approval) ====================
router.post('/books', createBook);
router.put('/books/:id', updateBook);
router.delete('/books/:id', deleteBook);
router.get('/books', getAdminBooks);
router.get('/books/pending', getPendingBooks);
// ✅ Approve/reject routes – frontend expects both POST and PUT
router.post('/books/:id/approve', approveBook);
router.put('/books/:id/approve', approveBook);
router.post('/books/:id/reject', rejectBook);
router.put('/books/:id/reject', rejectBook);

// ==================== ARTICLES (Admin) ====================
router.get('/articles', getAdminArticles);
router.get('/articles/stats', getArticleStats);
router.post('/articles/:id/approve', approveArticle);
router.post('/articles/:id/reject', rejectArticle);

// ==================== CAMPAIGNS (Admin) ====================
router.get('/campaigns', adminGetCampaigns);
router.get('/campaigns/:id', adminGetCampaign);
router.post('/campaigns/:id/approve', approveCampaign);
router.post('/campaigns/:id/reject', rejectCampaign);
router.post('/campaigns/:id/verify-manual', verifyManualPayment);
router.post('/campaigns/:id/refund', refundCampaign);

// ==================== FILE UPLOADS ====================
// NOTE: uploadImage/uploadFile controllers read `req.files` (plural array).
// upload.single() only populates `req.file` (singular), which left req.files
// undefined and made every upload fail — on a slow connection this surfaced
// to the user as a generic "Invalid response" toast instead of a real error.
// upload.any() populates req.files, matching what the controllers expect.

// Cover image upload: field name must be "image"
router.post('/upload', upload.any(), uploadImage);

// PDF file upload: field name must be "file"
router.post('/upload-file', upload.any(), uploadFile);

// ==================== PLATFORM STATS ====================
router.get('/platform-stats', getPlatformStats);

// ==================== ADMIN POST MANAGEMENT ====================
router.delete('/posts/:id', deletePostByAdmin);

// ==================== REVENUE ANALYTICS ====================
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/revenue', getRevenueAnalytics);

// ==================== CACHE MANAGEMENT ====================
// Diagnostic + operational tool: lets an admin force-clear the cached
// course payload for one course (or, with ?all=1, every cached course/
// list entry) without waiting out the 1–2 hour TTLs in getOrSetCache.
// Useful whenever course/lesson data was changed through a path that
// doesn't already call invalidateCourseCache, or when diagnosing whether
// a "content not showing" report is a stale-cache issue vs. a real data/
// rendering issue — clearing here and immediately re-checking the course
// isolates that variable.
router.post('/cache/clear-course/:id', clearCourseCache);

export default router;
