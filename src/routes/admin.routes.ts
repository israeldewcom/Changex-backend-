// ============================================================
// FILE: src/routes/admin.routes.ts (UPDATED)
// ============================================================

import { Router } from 'express';
import {
  getDashboard,
  getUsers,
  getUserById,
  getUserFullDetails,
  getUserPosts,
  updateUserRole,
  toggleUserBan,
  approveInstructor,
  getAdminCourses,
  getCourseDetails,
  approveCourse,
  rejectCourse,
  getWithdrawals,
  processWithdrawal,
  getPendingManualPayments,
  getAllManualPayments,
  getManualPaymentStats,
  getManualPaymentById,
  approveManualPayment,
  rejectManualPayment,
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
  getPublicAnnouncements,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  createChallenge,
  getChallenges,
  updateChallenge,
  deleteChallenge,
  joinChallenge,
  getChallengeParticipants,
  completeChallengeForUser,
  getAllChallengeProgressStats,
  createAd,
  getAds,
  updateAd,
  deleteAd,
  trackAdImpression,
  trackAdClick,
  getActiveAds,
  getSocialEarningsConfig,
  updateSocialEarningsConfig,
  getTopEarningPosts,
  getTotalSocialEarningsPool,
  triggerSocialEarnings,
  createBook,
  updateBook,
  deleteBook,
  getAdminBooks,
  approveBook,
  rejectBook,
  getPendingBooks,
  uploadImage,
  uploadFile,
  getPlatformStats,
  deletePostByAdmin,
} from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate, authorize('admin'));

// ─── Dashboard ──────────────────────────────────────────────────────
router.get('/dashboard', getDashboard);

// ─── Users ──────────────────────────────────────────────────────────
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.get('/users/:userId/full', getUserFullDetails);
router.get('/users/:userId/posts', getUserPosts);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/ban', toggleUserBan);
router.post('/users/:userId/approve-instructor', approveInstructor);

// ─── Courses ────────────────────────────────────────────────────────
router.get('/courses', getAdminCourses);
router.get('/courses/:id', getCourseDetails);
router.post('/courses/:id/approve', approveCourse);
router.post('/courses/:id/reject', rejectCourse);

// ─── Withdrawals ──────────────────────────────────────────────────
router.get('/withdrawals', getWithdrawals);
router.post('/withdrawals/:id/process', processWithdrawal);

// ─── Manual Payments ──────────────────────────────────────────────
router.get('/manual-payments/pending', getPendingManualPayments);
router.get('/manual-payments/all', getAllManualPayments);
router.get('/manual-payments/stats', getManualPaymentStats);
router.get('/manual-payments/:id', getManualPaymentById);
router.post('/manual-payments/:id/approve', approveManualPayment);
router.post('/manual-payments/:id/reject', rejectManualPayment);

// ─── Announcements ──────────────────────────────────────────────────
router.post('/announcements', createAnnouncement);
router.get('/announcements', getAnnouncements);
router.delete('/announcements/:id', deleteAnnouncement);
router.get('/announcements/public/latest', getPublicAnnouncements);

// ─── Coupons ──────────────────────────────────────────────────────
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

// ─── Challenges ──────────────────────────────────────────────────
router.post('/challenges', createChallenge);
router.get('/challenges', getChallenges);
router.put('/challenges/:id', updateChallenge);
router.delete('/challenges/:id', deleteChallenge);
router.post('/challenges/:id/join', joinChallenge);
router.get('/challenges/:challengeId/participants', getChallengeParticipants);
router.put('/challenges/:challengeId/complete/:userId', completeChallengeForUser);
router.get('/challenges/progress/stats', getAllChallengeProgressStats);

// ─── Ads ──────────────────────────────────────────────────────────
router.post('/ads', createAd);
router.get('/ads', getAds);
router.put('/ads/:id', updateAd);
router.delete('/ads/:id', deleteAd);
router.post('/ads/:id/impression', trackAdImpression);
router.post('/ads/:id/click', trackAdClick);
router.get('/ads/placement/:placement', getActiveAds);

// ─── Social Earnings ──────────────────────────────────────────────
router.get('/social-earnings/config', getSocialEarningsConfig);
router.put('/social-earnings/config', updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', getTopEarningPosts);
router.get('/social-earnings/total-pool', getTotalSocialEarningsPool);
router.post('/social-earnings/trigger', triggerSocialEarnings);

// ─── Books ──────────────────────────────────────────────────────────
router.post('/books', createBook);
router.put('/books/:id', updateBook);
router.delete('/books/:id', deleteBook);
router.get('/books', getAdminBooks);
router.put('/books/:id/approve', approveBook);
router.put('/books/:id/reject', rejectBook);
router.get('/books/pending', getPendingBooks);

// ─── Uploads ──────────────────────────────────────────────────────
router.post('/upload', upload.single('image'), uploadImage);
router.post('/upload-file', upload.single('file'), uploadFile);

// ─── Platform Stats ──────────────────────────────────────────────
router.get('/platform-stats', getPlatformStats);

// ─── Admin Delete Post ──────────────────────────────────────────
router.delete('/posts/:id', deletePostByAdmin);

export default router;
