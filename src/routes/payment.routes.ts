import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.post('/initialize-paystack', authenticate, paymentController.initializeTransaction);
router.post('/verify-paystack', authenticate, paymentController.verifyTransaction);
router.post('/subscribe', authenticate, paymentController.subscribe);
router.get('/transactions', authenticate, paymentController.getTransactions);
router.post('/withdraw', authenticate, paymentController.withdraw);
router.get('/methods', authenticate, paymentController.getPaymentMethods);

// Manual payment routes
router.post('/manual', authenticate, upload.single('receipt'), paymentController.submitManualPayment);
router.get('/manual/:paymentId', authenticate, paymentController.getManualPaymentStatus);
router.get('/manual/user/all', authenticate, paymentController.getUserManualPayments);

// Book purchase via Paystack
router.post('/purchase-book', authenticate, paymentController.purchaseBook);

export default router;
