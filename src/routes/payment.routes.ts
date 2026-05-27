import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.post('/initialize', authenticate, paymentController.payForCourse);
router.post('/verify', authenticate, paymentController.verifyPayment);

export default router;
