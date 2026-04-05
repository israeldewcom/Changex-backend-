import { config } from '../config';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Course } from '../models/Course';
import { Enrollment } from '../models/Enrollment';
import { logger } from '../utils/logger';
import { QueueService } from './QueueService';
import { EarningEngine } from './EarningEngine';
import mongoose from 'mongoose';

export class PaymentService {
  private static instance: PaymentService;
  private queueService: QueueService;
  private earningEngine: EarningEngine;

  private constructor() {
    this.queueService = QueueService.getInstance();
    this.earningEngine = EarningEngine.getInstance();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  // Stripe methods – disabled
  async createStripePaymentIntent(userId: string, amount: number, currency: string, metadata: Record<string, any>): Promise<{ clientSecret: string; paymentIntentId: string }> {
    throw new Error('Stripe payments are disabled. Use wallet instead.');
  }

  // Paystack methods – disabled
  async createPaystackPaymentUrl(userId: string, amount: number, email: string, metadata: Record<string, any>): Promise<string> {
    throw new Error('Paystack payments are disabled. Use wallet instead.');
  }

  async verifyPaystackPayment(reference: string): Promise<{ status: string; amount: number; metadata: any }> {
    throw new Error('Paystack payments are disabled.');
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

      await this.queueService.addJob('award-xp', { userId, amount: course.xpReward, reason: 'course_enrollment', metadata: { courseId: course._id.toString() } });
      return enrollment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async processWithdrawal(userId: string, amount: number, bankDetails: { bankName: string; accountNumber: string; accountName: string; bankCode: string }): Promise<Transaction> {
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
      await this.queueService.addJob('process-withdrawal', { transactionId: transaction._id.toString(), userId, amount, bankDetails });
      return transaction;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Webhook stubs (to satisfy existing imports)
  async processStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    logger.warn('Stripe webhook called but Stripe is disabled');
  }

  async processPaystackWebhook(body: any, signature: string): Promise<void> {
    logger.warn('Paystack webhook called but Paystack is disabled');
  }

  private generateReference(): string {
    return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
