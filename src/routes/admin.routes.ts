// ============================================================
// FILE: src/routes/admin.routes.ts (COMPLETE)
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
    createUser,
    banUser,

    // Course Management
    getAdminCourses,
    getCourseDetails,
    approveCourse,
    rejectCourse,
    deleteCourseByAdmin,
    createCourse,
    updateCourse,

    // Books
    createBook,
    updateBook,
    deleteBook,
    getAdminBooks,
    getPendingBooks,
    approveBook,
    rejectBook,

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
    getAdConfig,
    updateAdConfig,

    // Social Earnings
    getSocialEarningsConfig,
    updateSocialEarningsConfig,
    getTopEarningPosts,
    getTotalSocialEarningsPool,
    triggerSocialEarnings,

    // Platform Stats
    getPlatformStats,

    // Admin Post Management
    deletePostByAdmin,

    // File Uploads
    uploadImage,
    uploadFile,

    // Settings
    getFeatureFlags,
    updateFeatureFlags,
    getBankDetails,
    updateBankDetails,

    // Audit
    getAuditLogs,

    // Academies
    getAcademies,
    createAcademyAdmin,
    updateAcademyAdmin,
    deleteAcademyAdmin,

    // Gamification
    getAchievementsAdmin,
    createAchievement,
    updateAchievement,
    deleteAchievement,
    getLeaderboardAdmin,

    // Export All Data
    exportAllData,

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

// ─── Sponsorship Admin Controllers ───────────────────────────
import {
    adminGetSponsorships,
    approveSponsorship,
    rejectSponsorship,
} from '../controllers/sponsorship.controller.js';

// ─── Revenue Analytics ─────────────────────────────────────────
import { getRevenueAnalytics } from '../controllers/analytics.controller.js';

// ─── Payments ──────────────────────────────────────────────────
import {
    getWithdrawals,
    processWithdrawal,
    getPendingManualPayments,
    getAllManualPayments,
    getManualPaymentStats,
    getManualPaymentById,
    approveManualPayment,
    rejectManualPayment,
} from '../controllers/admin.controller.js';

import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── All admin routes require authentication and admin role ──────────
router.use(authenticate, authorize('admin'));

// ==================== DASHBOARD ====================
router.get('/dashboard', getDashboard);

// ==================== USERS ====================
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.get('/users/:userId/full', getUserFullDetails);
router.get('/users/:userId/posts', getUserPosts);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/ban', toggleUserBan);
router.patch('/users/:id/ban', banUser);
router.post('/users/:userId/approve-instructor', approveInstructor);
router.post('/users', createUser);

// ==================== COURSES ====================
router.get('/courses', getAdminCourses);
router.get('/courses/:id', getCourseDetails);
router.post('/courses/:id/approve', approveCourse);
router.post('/courses/:id/reject', rejectCourse);
router.delete('/courses/:id', deleteCourseByAdmin);
router.post('/courses', createCourse);
router.put('/courses/:id', updateCourse);

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

// ==================== BOOKS ====================
router.post('/books', createBook);
router.put('/books/:id', updateBook);
router.delete('/books/:id', deleteBook);
router.get('/books', getAdminBooks);
router.get('/books/pending', getPendingBooks);
router.post('/books/:id/approve', approveBook);
router.put('/books/:id/approve', approveBook);
router.post('/books/:id/reject', rejectBook);
router.put('/books/:id/reject', rejectBook);

// ==================== ARTICLES ====================
router.get('/articles', getAdminArticles);
router.get('/articles/stats', getArticleStats);
router.post('/articles/:id/approve', approveArticle);
router.post('/articles/:id/reject', rejectArticle);

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
router.get('/ads/config', getAdConfig);
router.put('/ads/config', updateAdConfig);
router.post('/ads/:id/impression', trackAdImpression);
router.post('/ads/:id/click', trackAdClick);
router.get('/ads/placement/:placement', getActiveAds);

// ==================== SOCIAL EARNINGS ====================
router.get('/social-earnings/config', getSocialEarningsConfig);
router.put('/social-earnings/config', updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', getTopEarningPosts);
router.get('/social-earnings/total-pool', getTotalSocialEarningsPool);
router.post('/social-earnings/trigger', triggerSocialEarnings);

// ==================== POSTS (Admin override) ====================
router.delete('/posts/:id', deletePostByAdmin);

// ==================== PLATFORM STATS ====================
router.get('/platform-stats', getPlatformStats);

// ==================== CAMPAIGNS ====================
router.get('/campaigns/admin/all', adminGetCampaigns);
router.get('/campaigns/admin/:id', adminGetCampaign);
router.post('/campaigns/admin/:id/approve', approveCampaign);
router.post('/campaigns/admin/:id/reject', rejectCampaign);
router.post('/campaigns/admin/:id/verify-manual', verifyManualPayment);
router.post('/campaigns/admin/:id/refund', refundCampaign);

// ==================== SPONSORSHIPS ====================
router.get('/sponsorships/admin/all', adminGetSponsorships);
router.post('/sponsorships/admin/:id/approve', approveSponsorship);
router.post('/sponsorships/admin/:id/reject', rejectSponsorship);

// ==================== ACADEMIES (Admin override) ====================
router.get('/academies', getAcademies);
router.post('/academies', createAcademyAdmin);
router.put('/academies/:id', updateAcademyAdmin);
router.delete('/academies/:id', deleteAcademyAdmin);

// ==================== GAMIFICATION (Admin) ====================
router.get('/gamification/achievements', getAchievementsAdmin);
router.post('/gamification/achievements', createAchievement);
router.put('/gamification/achievements/:id', updateAchievement);
router.delete('/gamification/achievements/:id', deleteAchievement);
router.get('/gamification/leaderboard', getLeaderboardAdmin);

// ==================== AUDIT LOGS ====================
router.get('/audit-logs', getAuditLogs);

// ==================== ANALYTICS ====================
router.get('/analytics/revenue', getRevenueAnalytics);
router.get('/revenue', getRevenueAnalytics);

// ==================== SETTINGS ====================
router.get('/settings/feature-flags', getFeatureFlags);
router.post('/settings/feature-flags', updateFeatureFlags);
router.get('/settings/bank-details', getBankDetails);
router.post('/settings/bank-details', updateBankDetails);

// ==================== EXPORT ALL DATA ====================
router.get('/export/:type', exportAllData);

// ==================== FILE UPLOADS ====================
router.post('/upload', upload.any(), uploadImage);
router.post('/upload-file', upload.any(), uploadFile);

export default router;
