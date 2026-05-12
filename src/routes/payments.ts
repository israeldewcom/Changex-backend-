import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { authenticate } from '../middleware/auth';
import { validateWithdrawal, validatePagination } from '../middleware/validation';
import { auditLog } from '../middleware/audit';
import { body } from 'express-validator';

const router = Router();
const paymentController = new PaymentController();

// Validation for subscription
const validateSubscription = [
  body('plan').isIn(['premium', 'elite']).withMessage('Plan must be premium or elite'),
  body('paymentMethod').isIn(['wallet', 'stripe', 'paystack']).withMessage('Invalid payment method'),
  body('couponCode').optional().isString().isLength({ min: 3, max: 20 }),
];

// All payment routes require authentication
router.use(authenticate);

// ============ Wallet & Transactions ============

/**
 * @route   POST /api/v1/payments/withdraw
 * @desc    Initiate a withdrawal request
 * @access  Private
 */
router.post(
  '/withdraw',
  validateWithdrawal,
  auditLog('INITIATE_WITHDRAWAL', 'Payment'),
  paymentController.initiateWithdrawal
);

/**
 * @route   GET /api/v1/payments/transactions
 * @desc    Get transaction history
 * @access  Private
 */
router.get(
  '/transactions',
  validatePagination,
  paymentController.getTransactionHistory
);

/**
 * @route   GET /api/v1/payments/withdrawals
 * @desc    Get withdrawal history
 * @access  Private
 */
router.get(
  '/withdrawals',
  validatePagination,
  paymentController.getWithdrawalHistory
);

/**
 * @route   GET /api/v1/payments/earnings/summary
 * @desc    Get earnings summary
 * @access  Private
 */
router.get(
  '/earnings/summary',
  paymentController.getEarningsSummary
);

/**
 * @route   GET /api/v1/payments/methods
 * @desc    Get available payment methods
 * @access  Private
 */
router.get(
  '/methods',
  paymentController.getPaymentMethods
);

// ============ Subscriptions ============

/**
 * @route   POST /api/v1/payments/subscribe
 * @desc    Create a new subscription (Premium/Elite)
 * @access  Private
 */
router.post(
  '/subscribe',
  validateSubscription,
  auditLog('CREATE_SUBSCRIPTION', 'Payment'),
  paymentController.createSubscription
);

/**
 * @route   GET /api/v1/payments/subscription
 * @desc    Get current subscription details
 * @access  Private
 */
router.get(
  '/subscription',
  paymentController.getSubscription
);

/**
 * @route   POST /api/v1/payments/cancel-subscription
 * @desc    Cancel active subscription
 * @access  Private
 */
router.post(
  '/cancel-subscription',
  auditLog('CANCEL_SUBSCRIPTION', 'Payment'),
  paymentController.cancelSubscription
);

/**
 * @route   GET /api/v1/payments/verify-subscription
 * @desc    Verify subscription payment after redirect
 * @access  Private
 */
router.get(
  '/verify-subscription',
  paymentController.verifySubscription
);

// ============ Payment Intents (for Stripe/Paystack) ============

/**
 * @route   POST /api/v1/payments/create-intent
 * @desc    Create a Stripe payment intent (for one-time payments)
 * @access  Private
 */
router.post(
  '/create-intent',
  body('amount').isFloat({ min: 100 }).withMessage('Amount must be at least ₦100'),
  body('metadata').optional().isObject(),
  async (req, res) => {
    try {
      const userId = (req as any).user?.userId;
      const { amount, currency = 'NGN', metadata = {} } = req.body;
      const { clientSecret, paymentIntentId } = await paymentController['paymentService'].createStripePaymentIntent(
        userId,
        amount,
        currency,
        metadata
      );
      res.json({ success: true, data: { clientSecret, paymentIntentId } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * @route   POST /api/v1/payments/paystack-url
 * @desc    Create a Paystack payment URL (for one-time payments)
 * @access  Private
 */
router.post(
  '/paystack-url',
  body('amount').isFloat({ min: 100 }).withMessage('Amount must be at least ₦100'),
  body('email').isEmail().withMessage('Valid email required'),
  async (req, res) => {
    try {
      const userId = (req as any).user?.userId;
      const { amount, email, metadata = {} } = req.body;
      const paymentUrl = await paymentController['paymentService'].createPaystackPaymentUrl(
        userId,
        amount,
        email,
        metadata
      );
      res.json({ success: true, data: { paymentUrl } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;
