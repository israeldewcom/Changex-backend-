import { config } from '../config';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Course } from '../models/Course';
import { Enrollment } from '../models/Enrollment';
import { logger } from '../utils/logger';
import { EarningEngine } from './EarningEngine';
import mongoose from 'mongoose';

export class PaymentService {
  private static instance: PaymentService;
  private earningEngine: EarningEngine;

  private constructor() {
    this.earningEngine = EarningEngine.getInstance();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  async processCoursePurchase(userId: string, courseId: string, paymentMethod: 'stripe' | 'paystack' | 'wallet', paymentReference?: string): Promise<Enrollment> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      const course = await Course.findById(courseId).session(session);
      if (!user || !course) throw new Error('User or course not found');
      const existingEnrollment = await Enrollment.findOne({ user: userId, course: courseId }).session(session);
      if (existingEnrollment) throw new Error('Already enrolled');
      const price = course.discountPrice || course.price;

      if (paymentMethod !== 'wallet') {
        throw new Error('Only wallet payments are currently supported.');
      }

      if (user.walletBalance < price) throw new Error('Insufficient wallet balance');
      user.walletBalance -= price;
      await user.save({ session });

      const transaction = new Transaction({
        user: userId,
        type: 'purchase',
        subtype: 'course',
        amount: price,
        currency: course.currency,
        status: 'completed',
        description: `Purchase of course: ${course.title}`,
        reference: this.generateReference(),
        paymentMethod: 'wallet',
        paymentGatewayReference: paymentReference,
        courseId: course._id,
        completedAt: new Date(),
      });
      await transaction.save({ session });

      const enrollment = new Enrollment({
        user: userId,
        course: courseId,
        paymentMethod: 'wallet',
        amountPaid: price,
        currency: course.currency,
        transactionId: transaction._id,
      });
      await enrollment.save({ session });

      course.enrollmentCount += 1;
      course.totalRevenue += price;
      await course.save({ session });

      await this.earningEngine.distributeCourseCommission(userId, courseId, price, transaction._id, session);
      await session.commitTransaction();

      // XP award – we can call EarningEngine directly instead of queue
      await this.earningEngine.addCourseCompletionReward(userId, courseId, course.xpReward, 0);
      return enrollment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async processWithdrawal(userId: string, amount: number, bankDetails: any): Promise<Transaction> {
    // Simplified – no queue, just mark as pending
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (user.walletBalance < amount) throw new Error('Insufficient balance');
      if (amount < 1000) throw new Error('Minimum withdrawal amount is ₦1,000');
      const transaction = new Transaction({
        user: userId,
        type: 'withdrawal',
        amount,
        currency: 'NGN',
        status: 'pending',
        description: `Withdrawal of ₦${amount.toLocaleString()}`,
        reference: this.generateReference(),
        withdrawalDetails: bankDetails,
      });
      await transaction.save({ session });
      user.walletBalance -= amount;
      user.pendingWithdrawal += amount;
      await user.save({ session });
      await session.commitTransaction();
      logger.info(`Withdrawal request created for user ${userId}, amount ${amount}`);
      return transaction;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Stubs for Stripe/Paystack (to satisfy existing imports)
  async createStripePaymentIntent(userId: string, amount: number, currency: string, metadata: any): Promise<any> {
    throw new Error('Stripe payments disabled');
  }
  async createPaystackPaymentUrl(userId: string, amount: number, email: string, metadata: any): Promise<string> {
    throw new Error('Paystack payments disabled');
  }
  async verifyPaystackPayment(reference: string): Promise<any> {
    throw new Error('Paystack payments disabled');
  }
  async processStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    logger.warn('Stripe webhook ignored');
  }
  async processPaystackWebhook(body: any, signature: string): Promise<void> {
    logger.warn('Paystack webhook ignored');
  }

  private generateReference(): string {
    return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
