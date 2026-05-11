// src/services/PaymentService.ts – COMPLETE (with WithdrawalRequest)
import Stripe from 'stripe';
// ... all original imports ...
import { WithdrawalRequest } from '../models/WithdrawalRequest'; // ✅ NEW

export class PaymentService {
  // ... original code (constructor, stripe, paystack) remains unchanged ...

  async processWithdrawal(userId: string, amount: number, bankDetails: { bankName: string; accountNumber: string; accountName: string; bankCode: string }): Promise<WithdrawalRequest> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (user.walletBalance < amount) throw new Error('Insufficient balance');
      if (amount < 1000) throw new Error('Minimum withdrawal amount is ₦1,000');

      // ✅ NEW – create WithdrawalRequest instead of directly creating a transaction
      const withdrawalRequest = new WithdrawalRequest({
        user: userId,
        amount,
        currency: 'NGN',
        bankDetails,
        status: 'pending',
      });
      await withdrawalRequest.save({ session });

      const transaction = new Transaction({
        user: userId,
        type: 'withdrawal',
        amount,
        currency: 'NGN',
        status: 'pending',
        description: `Withdrawal request #${withdrawalRequest._id}`,
        reference: this.generateReference(),
        withdrawalDetails: bankDetails,
        metadata: { withdrawalRequestId: withdrawalRequest._id }
      });
      await transaction.save({ session });

      withdrawalRequest.transactionId = transaction._id;
      await withdrawalRequest.save({ session });

      user.walletBalance -= amount;
      user.pendingWithdrawal += amount;
      await user.save({ session });

      await session.commitTransaction();

      // Queue the withdrawal for processing (admin will approve later)
      const queueService = QueueService.getInstance();
      await queueService.addJob('payment', { type: 'withdrawal_request', data: { withdrawalRequestId: withdrawalRequest._id, userId, amount, bankDetails } });

      return withdrawalRequest;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ... rest of the original file unchanged (webhook handlers, etc.) ...
}
