import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.use(authorize('admin'));

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
router.get('/announcements', adminController.getAnnouncements);
router.delete('/announcements/:id', adminController.deleteAnnouncement);
router.get('/announcements/latest', adminController.getPublicAnnouncements);

router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.put('/coupons/:id', adminController.updateCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);

router.get('/manual-payments/pending', adminController.getPendingManualPayments);
router.get('/manual-payments/all', adminController.getAllManualPayments);
router.get('/manual-payments/stats', adminController.getManualPaymentStats);
router.get('/manual-payments/:id', adminController.getManualPaymentById);
router.post('/manual-payments/:id/approve', adminController.approveManualPayment);
router.post('/manual-payments/:id/reject', adminController.rejectManualPayment);

router.post('/challenges', adminController.createChallenge);
router.get('/challenges', adminController.getChallenges);
router.put('/challenges/:id', adminController.updateChallenge);
router.delete('/challenges/:id', adminController.deleteChallenge);
router.get('/challenges/:challengeId/participants', adminController.getChallengeParticipants);
router.put('/challenges/:challengeId/complete/:userId', adminController.completeChallengeForUser);
router.get('/challenges/progress/stats', adminController.getAllChallengeProgressStats);

router.post('/ads', adminController.createAd);
router.get('/ads', adminController.getAds);
router.put('/ads/:id', adminController.updateAd);
router.delete('/ads/:id', adminController.deleteAd);
router.get('/ads/placement/:placement', adminController.getActiveAds);

// ─── Books (Admin) ──────────────────────────────────────────────────
router.get('/books', bookController.listAllBooks);
router.post('/books', bookController.createBook);
router.put('/books/:id', bookController.updateBook);
router.delete('/books/:id', bookController.deleteBook);

// ─── Uploads ──────────────────────────────────────────────────────
router.post('/upload', upload.single('image'), adminController.uploadImage);
router.post('/upload-file', upload.single('file'), adminController.uploadFile);

router.get('/social-earnings/config', adminController.getSocialEarningsConfig);
router.put('/social-earnings/config', adminController.updateSocialEarningsConfig);
router.get('/social-earnings/top-posts', adminController.getTopEarningPosts);
router.get('/social-earnings/total-pool', adminController.getTotalSocialEarningsPool);
router.post('/social-earnings/trigger', adminController.triggerSocialEarnings);

export default router;
