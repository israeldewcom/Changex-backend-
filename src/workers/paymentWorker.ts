// ============================================
// FILE: src/workers/paymentWorker.ts (new)
// ============================================
import { QueueConfig } from '../config/queue';
import { PaymentService } from '../services/PaymentService';

const paymentQueue = QueueConfig.getInstance().getQueue('payment');
if (paymentQueue) {
  paymentQueue.process(async (job) => {
    const { type, data } = job.data;
    const paymentService = PaymentService.getInstance();
    if (type === 'process_withdrawal') {
      await paymentService.processWithdrawal(data.userId, data.amount, data.bankDetails);
    } else if (type === 'verify_payment') {
      await paymentService.verifyPaystackPayment(data.reference);
    }
  });
}
