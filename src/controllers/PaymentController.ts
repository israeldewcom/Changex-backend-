import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { User, Transaction, WithdrawalRequest, Referral } from '../models';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = PaymentService.getInstance();
  }

  /**
   * Initiate a withdrawal request
   * POST /api/v1/payments/withdraw
   */
  initiateWithdrawal = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const userId = (req as any).user?.userId;
      const { amount, bankName, accountNumber, accountName, bankCode } = req.body;

      const withdrawalRequest = await this.paymentService.processWithdrawal(userId, amount, {
        bankName,
        accountNumber,
        accountName,
        bankCode,
      });

      res.json({
        success: true,
        data: withdrawalRequest,
        message: 'Withdrawal request submitted successfully. It will be processed within 1-3 business days.',
      });
    } catch (error: any) {
      logger.error('Withdrawal initiation error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  };

  /**
   * Get transaction history for the authenticated user
   * GET /api/v1/payments/transactions
   */
  getTransactionHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20, type, status } = req.query;

      const query: any = { user: userId };
      if (type) query.type = type;
      if (status) query.status = status;

      const skip = (Number(page) - 1) * Number(limit);
      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Transaction.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Get transactions error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  /**
   * Get withdrawal history for the authenticated user
   * GET /api/v1/payments/withdrawals
   */
  getWithdrawalHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const [withdrawals, total] = await Promise.all([
        WithdrawalRequest.find({ user: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        WithdrawalRequest.countDocuments({ user: userId }),
      ]);

      res.json({
        success: true,
        data: {
          withdrawals,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Get withdrawals error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  /**
   * Get earnings summary for the authenticated user
   * GET /api/v1/payments/earnings/summary
   */
  getEarningsSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const userIdObj = new mongoose.Types.ObjectId(userId);

      const [totalEarnings, monthlyEarnings, byType, dailyEarnings] = await Promise.all([
        Transaction.aggregate([
          { $match: { user: userIdObj, type: 'commission', status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          {
            $match: {
              user: userIdObj,
              type: 'commission',
              status: 'completed',
              createdAt: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              },
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          { $match: { user: userIdObj, type: 'commission', status: 'completed' } },
          { $group: { _id: '$subtype', total: { $sum: '$amount' } } },
        ]),
        Transaction.aggregate([
          {
            $match: {
              user: userIdObj,
              type: 'commission',
              status: 'completed',
              createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              total: { $sum: '$amount' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      res.json({
        success: true,
        data: {
          totalEarned: totalEarnings[0]?.total || 0,
          monthlyEarned: monthlyEarnings[0]?.total || 0,
          byType: byType.reduce((acc, curr) => {
            acc[curr._id || 'other'] = curr.total;
            return acc;
          }, {} as Record<string, number>),
          dailyEarnings: dailyEarnings.map(d => ({ date: d._id, amount: d.total })),
        },
      });
    } catch (error) {
      logger.error('Get earnings summary error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  /**
   * Get available payment methods
   * GET /api/v1/payments/methods
   */
  getPaymentMethods = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('stripeCustomerId paystackCustomerCode walletBalance');

      res.json({
        success: true,
        data: {
          wallet: { enabled: true, balance: user?.walletBalance || 0 },
          stripe: { enabled: true, hasCustomer: !!user?.stripeCustomerId },
          paystack: { enabled: true, hasCustomer: !!user?.paystackCustomerCode },
          availableMethods: ['wallet', 'stripe', 'paystack'],
        },
      });
    } catch (error) {
      logger.error('Get payment methods error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  /**
   * Create a subscription (Premium or Elite) with referral bonus tracking
   * POST /api/v1/payments/subscribe
   */
  createSubscription = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const userId = (req as any).user?.userId;
      const { plan, paymentMethod, paymentReference, couponCode } = req.body;

      if (!plan || !['premium', 'elite'].includes(plan)) {
        res.status(400).json({ success: false, message: 'Invalid plan. Choose premium or elite' });
        return;
      }

      if (!paymentMethod || !['wallet', 'stripe', 'paystack'].includes(paymentMethod)) {
        res.status(400).json({ success: false, message: 'Invalid payment method' });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (user.subscriptionStatus === 'active' && user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()) {
        res.status(400).json({
          success: false,
          message: `You already have an active ${user.subscriptionTier} subscription until ${user.subscriptionExpiresAt.toLocaleDateString()}`,
        });
        return;
      }

      let amount = plan === 'premium' ? 5000 : 15000;
      let discountApplied = 0;
      let couponId = null;

      if (couponCode) {
        const { Coupon } = await import('../models/Coupon');
        const coupon = await Coupon.findOne({
          code: couponCode.toUpperCase(),
          isActive: true,
          validFrom: { $lte: new Date() },
          validUntil: { $gte: new Date() },
          $or: [{ usageLimit: { $gt: '$usedCount' } }, { usageLimit: null }],
        });

        if (coupon) {
          if (coupon.discountType === 'percentage') {
            discountApplied = (amount * coupon.discountValue) / 100;
            if (coupon.maxDiscount && discountApplied > coupon.maxDiscount) {
              discountApplied = coupon.maxDiscount;
            }
          } else {
            discountApplied = Math.min(coupon.discountValue, amount);
          }
          amount = amount - discountApplied;
          couponId = coupon._id;
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }

      if (paymentMethod === 'wallet') {
        if (user.walletBalance < amount) {
          res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. You need ₦${amount.toLocaleString()} but have ₦${user.walletBalance.toLocaleString()}`,
          });
          return;
        }

        user.walletBalance -= amount;
        user.subscriptionTier = plan;
        user.subscriptionStatus = 'active';
        user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await user.save();

        const transaction = new Transaction({
          user: userId,
          type: 'subscription',
          amount: amount,
          currency: 'NGN',
          status: 'completed',
          description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription - 30 days`,
          reference: `SUB_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          paymentMethod: 'wallet',
          metadata: { plan, discountApplied, couponId, originalPrice: plan === 'premium' ? 5000 : 15000 },
          completedAt: new Date(),
        });
        await transaction.save();

        // ✅ Process referral upgrade bonus if user was referred
        await this.processReferralUpgradeBonus(userId, amount);

        res.json({
          success: true,
          message: `Successfully upgraded to ${plan}! Your subscription is active for 30 days.`,
          data: {
            subscriptionTier: user.subscriptionTier,
            subscriptionStatus: user.subscriptionStatus,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            amountPaid: amount,
            discountApplied,
          },
        });
      } else if (paymentMethod === 'stripe') {
        const { clientSecret, paymentIntentId } = await this.paymentService.createStripePaymentIntent(
          userId,
          amount,
          'NGN',
          { type: 'subscription', plan, couponId: couponId?.toString(), discountApplied }
        );

        res.json({
          success: true,
          data: { clientSecret, paymentIntentId, amount, plan },
          requiresPayment: true,
          message: 'Complete payment to activate your subscription',
        });
      } else if (paymentMethod === 'paystack') {
        const paymentUrl = await this.paymentService.createPaystackPaymentUrl(
          userId,
          amount,
          user.email,
          { type: 'subscription', plan, couponId: couponId?.toString(), discountApplied }
        );

        res.json({
          success: true,
          data: { paymentUrl, amount, plan },
          requiresPayment: true,
          message: 'Complete payment to activate your subscription',
        });
      }
    } catch (error: any) {
      logger.error('Create subscription error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
  };

  /**
   * Process referral upgrade bonus when a referred user subscribes
   */
  private async processReferralUpgradeBonus(userId: string, amountPaid: number): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user || !user.referredBy) return;

      const referral = await Referral.findOne({ referred: userId, status: 'pending' });
      if (!referral) return;

      // Mark referral as active/converted
      referral.status = 'active';
      referral.firstPurchaseAt = new Date();
      await referral.save();

      // Calculate bonus (e.g., 20% of first payment or fixed ₦500)
      const bonusAmount = Math.min(amountPaid * 0.2, 5000); // 20% up to ₦5,000
      const referrer = await User.findById(referral.referrer);
      
      if (referrer) {
        referrer.walletBalance += bonusAmount;
        referrer.referralEarnings += bonusAmount;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        await referrer.save();

        // Create transaction record for the bonus
        const transaction = new Transaction({
          user: referrer._id,
          type: 'commission',
          subtype: 'referral',
          amount: bonusAmount,
          currency: 'NGN',
          status: 'completed',
          description: `Referral bonus for user upgrade (${user.firstName} ${user.lastName})`,
          reference: `REF_BONUS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          metadata: { referredUserId: userId, referralLevel: referral.level, amountPaid },
          completedAt: new Date(),
        });
        await transaction.save();

        logger.info(`Referral bonus of ₦${bonusAmount} awarded to ${referrer.email} for referring ${user.email}`);
      }
    } catch (error) {
      logger.error('Error processing referral upgrade bonus:', error);
    }
  }

  /**
   * Verify subscription payment (webhook alternative)
   * GET /api/v1/payments/verify-subscription?reference=xxx
   */
  verifySubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reference } = req.query;
      if (!reference) {
        res.status(400).json({ success: false, message: 'Reference required' });
        return;
      }

      const verification = await this.paymentService.verifyPaystackPayment(reference as string);

      if (verification.status === 'success') {
        const { userId, plan } = verification.metadata;
        const user = await User.findById(userId);

        if (user) {
          user.subscriptionTier = plan;
          user.subscriptionStatus = 'active';
          user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await user.save();

          const transaction = new Transaction({
            user: userId,
            type: 'subscription',
            amount: verification.amount,
            currency: 'NGN',
            status: 'completed',
            description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription - 30 days`,
            reference: reference as string,
            paymentMethod: 'paystack',
            paymentGatewayReference: reference as string,
            metadata: verification.metadata,
            completedAt: new Date(),
          });
          await transaction.save();

          // ✅ Process referral upgrade bonus after successful payment verification
          await this.processReferralUpgradeBonus(userId, verification.amount);
        }

        res.json({
          success: true,
          message: 'Subscription verified and activated successfully',
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Payment verification failed',
        });
      }
    } catch (error: any) {
      logger.error('Verify subscription error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  /**
   * Cancel subscription
   * POST /api/v1/payments/cancel-subscription
   */
  cancelSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (user.subscriptionStatus !== 'active') {
        res.status(400).json({ success: false, message: 'No active subscription to cancel' });
        return;
      }

      user.subscriptionStatus = 'canceled';
      await user.save();

      res.json({
        success: true,
        message: 'Your subscription has been canceled. You will retain access until the expiration date.',
        data: {
          expiresAt: user.subscriptionExpiresAt,
        },
      });
    } catch (error: any) {
      logger.error('Cancel subscription error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  /**
   * Get current subscription details
   * GET /api/v1/payments/subscription
   */
  getSubscription = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select(
        'subscriptionTier subscriptionStatus subscriptionExpiresAt'
      );

      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const daysRemaining = user.subscriptionExpiresAt
        ? Math.max(0, Math.ceil((user.subscriptionExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 0;

      res.json({
        success: true,
        data: {
          tier: user.subscriptionTier,
          status: user.subscriptionStatus,
          expiresAt: user.subscriptionExpiresAt,
          daysRemaining,
          isActive: user.subscriptionStatus === 'active' && daysRemaining > 0,
        },
      });
    } catch (error) {
      logger.error('Get subscription error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}

export default PaymentController;
