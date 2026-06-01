import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.post('/initialize-paystack', authenticate, paymentController.initializeTransaction);
router.post('/verify-paystack', authenticate, paymentController.verifyTransaction);
router.post('/subscribe', authenticate, paymentController.subscribe);
router.get('/transactions', authenticate, paymentController.getTransactions);
router.post('/withdraw', authenticate, paymentController.withdraw);
router.get('/methods', authenticate, paymentController.getPaymentMethods);   // added

export default router;
