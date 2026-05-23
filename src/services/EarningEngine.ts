// ============================================
// FILE: src/services/EarningEngine.ts (with referral bonus method)
// ============================================
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Referral } from '../models/Referral';
import { Course } from '../models/Course';
import { logger } from '../utils/logger';
import { QueueService } from './QueueService';

export class EarningEngine {
  private static instance: EarningEngine;
  private queueService: QueueService;
  private readonly COURSE_CREATOR_COMMISSION = 0.70;
  private readonly AFFILIATE_LEVEL_1 = 0.20;
  private readonly AFFILIATE_LEVEL_2 = 0.05;
  private readonly AFFILIATE_LEVEL_3 = 0.02;
  private readonly PLATFORM_FEE = 0.10;

  private constructor() {
    this.queueService = QueueService.getInstance();
  }

  static getInstance(): EarningEngine {
    if (!EarningEngine.instance) {
      EarningEngine.instance = new EarningEngine();
    }
    return EarningEngine.instance;
  }

  async addXP(userId: string, amount: number, session?: mongoose.ClientSession): Promise<void> {
    const user = await User.findById(userId).session(session || null);
    if (!user) throw new Error('User not found');
    user.xp += amount;
    const newLevel = user.calculateLevel();
    if (newLevel > user.level) {
      user.level = newLevel;
      const levelBonus = newLevel * 100;
      user.xp += levelBonus;
      await this.queueService.addJob('send-notification', {
        userId,
        type: 'level_up',
        data: { oldLevel: user.level - newLevel + newLevel, newLevel, bonus: levelBonus }
      });
    }
    await user.save({ session });
  }

  async addReferralBonusOnSubscription(userId: string, amount: number = 500): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;
    if (!user.referredBy) return;

    const referrer = await User.findById(user.referredBy);
    if (!referrer) return;

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addToWallet(referrer._id.toString(), amount, 'commission', { type: 'referral_subscription', referredId: userId }, session);
      const referral = await Referral.findOne({ referred: userId }).session(session);
      if (referral) {
        referral.status = 'completed';
        referral.firstPurchaseAt = new Date();
        await referral.save({ session });
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Referral bonus error:', error);
    } finally {
      session.endSession();
    }
  }

  async distributeCourseCommission(
    buyerId: string,
    courseId: string,
    amount: number,
    transactionId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession
  ): Promise<void> {
    try {
      const course = await Course.findById(courseId).session(session);
      if (!course) throw new Error('Course not found');
      const creator = await User.findById(course.instructor).session(session);
      if (!creator) throw new Error('Creator not found');

      const creatorAmount = amount * this.COURSE_CREATOR_COMMISSION;
      const platformAmount = amount * this.PLATFORM_FEE;
      let remainingForAffiliates = amount - creatorAmount - platformAmount;

      await this.addToWallet(creator._id.toString(), creatorAmount, 'commission', { type: 'course_sale', courseId: course._id.toString(), transactionId: transactionId.toString() }, session);

      const buyer = await User.findById(buyerId).session(session);
      if (buyer && buyer.referredBy) {
        const referrals = await Referral.find({ referred: buyerId, status: 'active' }).session(session);
        for (const referral of referrals) {
          let commissionRate = 0;
          switch (referral.level) {
            case 1: commissionRate = this.AFFILIATE_LEVEL_1; break;
            case 2: commissionRate = this.AFFILIATE_LEVEL_2; break;
            case 3: commissionRate = this.AFFILIATE_LEVEL_3; break;
          }
          const commissionAmount = amount * commissionRate;
          if (commissionAmount > 0 && remainingForAffiliates >= commissionAmount) {
            await this.addToWallet(referral.referrer.toString(), commissionAmount, 'commission', { type: 'affiliate', level: referral.level, courseId: course._id.toString(), transactionId: transactionId.toString() }, session);
            remainingForAffiliates -= commissionAmount;
            referral.totalCommission += commissionAmount;
            referral.commissions.push({ amount: commissionAmount, type: 'course_purchase', transactionId, createdAt: new Date() });
            await referral.save({ session });
          }
        }
      }

      await this.addToWallet('platform', platformAmount, 'platform_fee', { type: 'platform_fee', courseId: course._id.toString(), transactionId: transactionId.toString() }, session);
      logger.info('Commission distributed', { courseId, amount, creatorAmount, platformAmount, affiliateAmount: amount - creatorAmount - platformAmount - remainingForAffiliates });
    } catch (error) {
      logger.error('Error distributing course commission:', error);
      throw error;
    }
  }

  async addLessonCompletionReward(userId: string, lessonId: string, courseId: string, xpReward: number, nairaReward: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'lesson_completion', lessonId, courseId }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addQuizCompletionReward(userId: string, quizId: string, courseId: string, score: number, xpReward: number, nairaReward: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0 && score >= 70) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'quiz_completion', quizId, courseId, score }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addCourseCompletionReward(userId: string, courseId: string, xpReward: number, nairaReward: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addXP(userId, xpReward, session);
      if (nairaReward > 0) {
        await this.addToWallet(userId, nairaReward, 'reward', { type: 'course_completion', courseId }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addReferralReward(referrerId: string, referredId: string, amount: number, level: number): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let commissionRate = 0;
      switch (level) {
        case 1: commissionRate = this.AFFILIATE_LEVEL_1; break;
        case 2: commissionRate = this.AFFILIATE_LEVEL_2; break;
        case 3: commissionRate = this.AFFILIATE_LEVEL_3; break;
      }
      const commissionAmount = amount * commissionRate;
      if (commissionAmount > 0) {
        await this.addToWallet(referrerId, commissionAmount, 'commission', { type: 'referral', level, referredId }, session);
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addDailyReward(userId: string): Promise<number> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const baseReward = 50;
    const streakBonus = Math.min(user.streak * 5, 100);
    const totalReward = baseReward + streakBonus;
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await this.addToWallet(userId, totalReward, 'reward', { type: 'daily_reward', streak: user.streak }, session);
      const lastActive = user.lastActiveAt;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastActive.toDateString() === yesterday.toDateString()) user.streak += 1;
      else if (lastActive.toDateString() !== today.toDateString()) user.streak = 1;
      user.lastActiveAt = today;
      await user.save({ session });
      await session.commitTransaction();
      return totalReward;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async addToWallet(userId: string, amount: number, type: string, metadata: Record<string, any>, session?: mongoose.ClientSession): Promise<void> {
    if (userId === 'platform') {
      await this.queueService.addJob('update-platform-wallet', { amount, type, metadata });
      return;
    }
    const user = await User.findById(userId).session(session || null);
    if (!user) throw new Error('User not found');
    user.walletBalance += amount;
    user.totalEarned += amount;
    await user.save({ session });

    const transaction = new Transaction({
      user: userId,
      type: 'commission',
      subtype: type as any,
      amount,
      currency: 'NGN',
      status: 'completed',
      description: `${type} reward of ₦${amount.toLocaleString()}`,
      reference: `EARN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata,
      completedAt: new Date(),
    });
    await transaction.save({ session });
  }
}
