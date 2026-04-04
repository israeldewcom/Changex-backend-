// ============================================
// FILE: src/services/PaymentService.ts (unchanged)
// ============================================
import Stripe from 'stripe';
import Paystack from 'paystack';
import { config } from '../config';
import { User, IUser } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Course } from '../models/Course';
import { Enrollment } from '../models/Enrollment';
import { logger } from '../utils/logger';
import { QueueService } from './QueueService';
import { EarningEngine } from './EarningEngine';
import mongoose from 'mongoose';

export class PaymentService {
  private static instance: PaymentService;
  private stripe: Stripe;
  private paystack: any;
  private queueService: QueueService;
  private earningEngine: EarningEngine;

  private constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
    this.paystack = Paystack;
    this.queueService = QueueService.getInstance();
    this.earningEngine = EarningEngine.getInstance();
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  async createStripePaymentIntent(userId: string, amount: number, currency: string, metadata: Record<string, any>): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      customer: customerId,
      metadata,
      automatic_payment_methods: { enabled: true },
    });
    return { clientSecret: paymentIntent.client_secret!, paymentIntentId: paymentIntent.id };
  }

  async createPaystackPaymentUrl(userId: string, amount: number, email: string, metadata: Record<string, any>): Promise<string> {
    const response = await this.paystack.transaction.initialize({
      amount: amount * 100,
      email,
      metadata,
      callback_url: `${config.frontendUrl}/payment/verify`,
    });
    return response.data.authorization_url;
  }

  async verifyPaystackPayment(reference: string): Promise<{ status: string; amount: number; metadata: any }> {
    const response = await this.paystack.transaction.verify({ reference });
    return { status: response.data.status, amount: response.data.amount / 100, metadata: response.data.metadata };
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
      if (paymentMethod === 'wallet') {
        if (user.walletBalance < price) throw new Error('Insufficient wallet balance');
        user.walletBalance -= price;
        await user.save({ session });
      }
      const transaction = new Transaction({
        user: userId,
        type: 'purchase',
        subtype: 'course',
        amount: price,
        currency: course.currency,
        status: 'completed',
        description: `Purchase of course: ${course.title}`,
        reference: this.generateReference(),
        paymentMethod: paymentMethod === 'wallet' ? 'wallet' : (paymentMethod === 'stripe' ? 'stripe' : 'paystack'),
        paymentGatewayReference: paymentReference,
        courseId: course._id,
        completedAt: new Date(),
      });
      await transaction.save({ session });
      const enrollment = new Enrollment({
        user: userId,
        course: courseId,
        paymentMethod,
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

  async processStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    let event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }
    switch (event.type) {
      case 'payment_intent.succeeded': await this.handleSuccessfulPayment(event.data.object); break;
      case 'customer.subscription.created': case 'customer.subscription.updated': await this.handleSubscriptionUpdate(event.data.object); break;
      case 'customer.subscription.deleted': await this.handleSubscriptionCancellation(event.data.object); break;
    }
  }

  async processPaystackWebhook(body: any, signature: string): Promise<void> {
    const hash = crypto.createHmac('sha512', config.paystack.webhookSecret).update(JSON.stringify(body)).digest('hex');
    if (hash !== signature) throw new Error('Invalid webhook signature');
    const event = body.event;
    const data = body.data;
    switch (event) {
      case 'charge.success': await this.handlePaystackChargeSuccess(data); break;
      case 'transfer.success': await this.handleTransferSuccess(data); break;
      case 'transfer.failed': await this.handleTransferFailed(data); break;
    }
  }

  private async handleSuccessfulPayment(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const metadata = paymentIntent.metadata;
    if (metadata.type === 'course_purchase') {
      await this.processCoursePurchase(metadata.userId, metadata.courseId, 'stripe', paymentIntent.id);
    }
  }

  private async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) return;
    const status = subscription.status === 'active' ? 'active' : subscription.status === 'canceled' ? 'canceled' : 'expired';
    let tier: 'free' | 'premium' | 'elite' = 'free';
    const priceId = subscription.items.data[0]?.price.id;
    if (priceId === config.stripe.premiumPriceId) tier = 'premium';
    if (priceId === config.stripe.elitePriceId) tier = 'elite';
    user.subscriptionTier = tier;
    user.subscriptionStatus = status;
    user.subscriptionId = subscription.id;
    user.subscriptionExpiresAt = new Date(subscription.current_period_end * 1000);
    await user.save();
  }

  private async handleSubscriptionCancellation(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (user) {
      user.subscriptionStatus = 'canceled';
      await user.save();
    }
  }

  private async handlePaystackChargeSuccess(data: any): Promise<void> {
    const metadata = data.metadata;
    if (metadata.type === 'course_purchase') {
      await this.processCoursePurchase(metadata.userId, metadata.courseId, 'paystack', data.reference);
    }
  }

  private async handleTransferSuccess(data: any): Promise<void> {
    const reference = data.reference;
    const transaction = await Transaction.findOne({ reference });
    if (transaction) {
      transaction.status = 'completed';
      transaction.processedAt = new Date();
      transaction.completedAt = new Date();
      await transaction.save();
      const user = await User.findById(transaction.user);
      if (user) {
        user.pendingWithdrawal -= transaction.amount;
        user.totalWithdrawn += transaction.amount;
        await user.save();
      }
    }
  }

  private async handleTransferFailed(data: any): Promise<void> {
    const reference = data.reference;
    const transaction = await Transaction.findOne({ reference });
    if (transaction) {
      transaction.status = 'failed';
      await transaction.save();
      const user = await User.findById(transaction.user);
      if (user) {
        user.walletBalance += transaction.amount;
        user.pendingWithdrawal -= transaction.amount;
        await user.save();
      }
    }
  }

  private generateReference(): string {
    return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
