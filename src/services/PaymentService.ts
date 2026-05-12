import Stripe from 'stripe';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { WithdrawalRequest } from '../models/WithdrawalRequest';
import { config } from '../config';

export class PaymentService {
  private static instance: PaymentService;
  private stripe: Stripe;

  private constructor() {
    this.stripe = new Stripe(config.stripeSecretKey || '', {
      apiVersion: '2023-10-16',
    });
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Create a new withdrawal request (admin approval flow)
   */
  async processWithdrawal(
    userId: string,
    amount: number,
    bankDetails: { bankName: string; accountNumber: string; accountName: string; bankCode: string }
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (user.walletBalance < amount) throw new Error('Insufficient balance');
      if (amount < 1000) throw new Error('Minimum withdrawal is ₦1,000');

      // Create withdrawal request
      const withdrawalRequest = new WithdrawalRequest({
        user: userId,
        amount,
        currency: 'NGN',
        bankDetails,
        status: 'pending',
      });
      await withdrawalRequest.save({ session });

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        type: 'withdrawal',
        amount,
        currency: 'NGN',
        status: 'pending',
        description: `Withdrawal request #${withdrawalRequest._id}`,
        reference: `WD-${Date.now()}`,
        metadata: { withdrawalRequestId: withdrawalRequest._id },
      });
      await transaction.save({ session });

      withdrawalRequest.transactionId = transaction._id;
      await withdrawalRequest.save({ session });

      user.walletBalance -= amount;
      user.pendingWithdrawal += amount;
      await user.save({ session });

      await session.commitTransaction();

      // (Optional) queue job to notify admin
      return withdrawalRequest;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Create Stripe payment intent
   */
  async createPaymentIntent(amount: number, currency: string = 'ngn') {
    return this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
    });
  }

  /**
   * Confirm a transaction (e.g., after webhook)
   */
  async confirmTransaction(transactionId: string) {
    return Transaction.findByIdAndUpdate(transactionId, { status: 'completed' }, { new: true });
  }

  /**
   * Generate unique reference
   */
  private generateReference(): string {
    return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add other payment methods as needed...
}

export default PaymentService;
