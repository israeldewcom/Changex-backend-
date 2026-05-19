// ============================================
// FILE: src/services/AffiliateService.ts (new complete service)
// ============================================
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Referral } from '../models/Referral';
import { Transaction } from '../models/Transaction';
import { EarningEngine } from './EarningEngine';
import { logger } from '../utils/logger';

export class AffiliateService {
  private static instance: AffiliateService;
  private earningEngine: EarningEngine;

  private constructor() {
    this.earningEngine = EarningEngine.getInstance();
  }

  static getInstance(): AffiliateService {
    if (!AffiliateService.instance) {
      AffiliateService.instance = new AffiliateService();
    }
    return AffiliateService.instance;
  }

  async acceptAffiliateOffer(userId: string, courseId: string): Promise<{ link: string }> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      const course = await Course.findById(courseId).session(session);
      if (!user || !course) throw new Error('User or course not found');
      if (!course.hasAffiliate) throw new Error('Affiliate not enabled for this course');

      const existingLink = user.affiliateLinks.find(l => l.courseId.toString() === courseId);
      if (existingLink) return { link: existingLink.link };

      const link = `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}`;
      user.affiliateLinks.push({ courseId: course._id as mongoose.Types.ObjectId, link, createdAt: new Date() });
      await user.save({ session });

      await session.commitTransaction();
      return { link };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async trackAffiliateClick(affiliateId: string, courseId: string, ip: string, userAgent: string): Promise<void> {
    // Store click in Redis or a separate collection for analytics
    // For now, we just log
    logger.info(`Affiliate click: affiliate=${affiliateId}, course=${courseId}, ip=${ip}, ua=${userAgent}`);
    // Optionally: create a temporary record in Redis with expiry 30 days
  }

  async registerAffiliateSignup(affiliateId: string, courseId: string, newUserId: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const referrer = await User.findById(affiliateId).session(session);
      if (!referrer) throw new Error('Affiliate not found');

      const existingReferral = await Referral.findOne({ referred: newUserId }).session(session);
      if (existingReferral) return; // already referred

      const referral = new Referral({
        referrer: affiliateId,
        referred: newUserId,
        level: 1,
        status: 'pending',
        referralCode: referrer.referralCode,
        type: 'affiliate',
        courseId,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      });
      await referral.save({ session });

      await User.findByIdAndUpdate(newUserId, { referredBy: affiliateId }, { session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async processAffiliateCommissionOnPurchase(userId: string, courseId: string, amount: number, transactionId: mongoose.Types.ObjectId): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const referral = await Referral.findOne({ referred: userId, courseId, type: 'affiliate', status: 'pending' }).session(session);
      if (!referral) return;

      const course = await Course.findById(courseId).session(session);
      if (!course) return;

      const commissionRate = course.affiliatePercent / 100;
      const commissionAmount = amount * commissionRate;

      if (commissionAmount <= 0) return;

      await this.earningEngine.addToWallet(referral.referrer.toString(), commissionAmount, 'commission', {
        type: 'affiliate_sale',
        courseId,
        transactionId: transactionId.toString(),
        percent: course.affiliatePercent
      }, session);

      referral.totalCommission += commissionAmount;
      referral.commissions.push({
        amount: commissionAmount,
        type: 'affiliate_sale',
        transactionId,
        createdAt: new Date()
      });
      referral.status = 'completed';
      referral.firstPurchaseAt = new Date();
      await referral.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
