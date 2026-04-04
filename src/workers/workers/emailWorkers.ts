// ============================================
// FILE: src/workers/emailWorker.ts (new)
// ============================================
import { QueueConfig } from '../config/queue';
import { EmailService } from '../services/EmailService';

const emailQueue = QueueConfig.getInstance().getQueue('email');
if (emailQueue) {
  emailQueue.process(async (job) => {
    const { type, data } = job.data;
    const emailService = EmailService.getInstance();
    switch (type) {
      case 'verification': await emailService.sendVerificationEmail(data.email, data.token); break;
      case 'password_reset': await emailService.sendPasswordResetEmail(data.email, data.token); break;
      case 'welcome': await emailService.sendWelcomeEmail(data.email, data.name); break;
      case 'payment_receipt': await emailService.sendPaymentReceipt(data.email, data.transaction); break;
      case 'course_completion': await emailService.sendCourseCompletionEmail(data.email, data.course); break;
      case 'withdrawal_notification': await emailService.sendWithdrawalNotification(data.email, data.amount, data.status); break;
    }
  });
}
