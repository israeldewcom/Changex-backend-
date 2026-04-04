// ============================================
// FILE: src/routes/payments.ts (unchanged)
// ============================================
import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { authenticate } from '../middleware/auth';
import { validateWithdrawal, validatePagination } from '../middleware/validation';
import { auditLog } from '../middleware/audit';

const router = Router();
const paymentController = new PaymentController();

router.use(authenticate);
router.post('/withdraw', validateWithdrawal, auditLog('INITIATE_WITHDRAWAL', 'Payment'), paymentController.initiateWithdrawal);
router.get('/transactions', validatePagination, paymentController.getTransactionHistory);
router.get('/withdrawals', validatePagination, paymentController.getWithdrawalHistory);
router.get('/earnings/summary', paymentController.getEarningsSummary);
router.get('/methods', paymentController.getPaymentMethods);

export default router;
