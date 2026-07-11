// ============================================================
// FILE: src/routes/payment.routes.ts (UPDATED)
// ============================================================

import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── All payment routes require authentication ────────────────────
router.use(authenticate);

// ─── Paystack ──────────────────────────────────────────────────────
router.post('/initialize-paystack', paymentController.initializeTransaction);
router.post('/verify-paystack', paymentController.verifyTransaction);

// ─── Subscriptions ─────────────────────────────────────────────────
router.post('/subscribe', paymentController.subscribe);
router.post('/cancel-subscription', paymentController.cancelSubscription);

// ─── Wallet & Transactions ──────────────────────────────────────────
router.get('/transactions', paymentController.getTransactions);
router.get('/wallet-breakdown', paymentController.getWalletBreakdown);
router.post('/withdraw', paymentController.withdraw);
router.get('/methods', paymentController.getPaymentMethods);

// ─── Manual Payments ────────────────────────────────────────────────
router.post('/manual', upload.single('receipt'), paymentController.submitManualPayment);
router.get('/manual/:paymentId', paymentController.getManualPaymentStatus);
router.get('/manual/user/all', paymentController.getUserManualPayments);

// ─── Welcome Bonus ──────────────────────────────────────────────────
router.post('/claim-welcome-bonus', paymentController.claimWelcomeBonus);

export default router;
