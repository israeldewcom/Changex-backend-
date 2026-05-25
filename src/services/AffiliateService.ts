// ============================================
// FILE: src/services/AffiliateService.ts (Complete – with tracking, commission, and stats)
// ============================================
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Referral } from '../models/Referral';
import { logger } from '../utils/logger';

export class AffiliateService {
  private static instance: AffiliateService;

  private constructor() {}

  static getInstance(): AffiliateService {
    if (!AffiliateService.instance) {
      AffiliateService.instance = new AffiliateService();
    }
    return AffiliateService.instance;
  }

  async acceptAffiliateOffer(userId: string, courseId: string): Promise<{ link: string; code: string }> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      const course = await Course.findById(courseId).session(session);
      if (!user || !course) throw new Error('User or course not found');
      if (!course.hasAffiliate) throw new Error('Affiliate not enabled for this course');

      // Check if already accepted
      const alreadyAccepted = user.affiliateLinks?.some(l => l.courseId?.toString() === courseId);
      if (alreadyAccepted) {
        const existing = user.affiliateLinks.find(l => l.courseId?.toString() === courseId);
        return { link: existing!.link, code: existing!.code };
      }

      // Generate unique code and link
      const uniqueCode = `AFF${userId.slice(-4)}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
      const link = `${backendUrl}/api/v1/affiliate/click/${userId}/${courseId}/${uniqueCode}`;
      
      if (!user.affiliateLinks) user.affiliateLinks = [];
      user.affiliateLinks.push({
        courseId: course._id,
        courseTitle: course.title,
        link,
        code: uniqueCode,
        clicks: 0,
        signups: 0,
        conversions: 0,
        commissionRate: course.affiliatePercent || 15,
        totalEarned: 0,
        createdAt: new Date()
      });
      await user.save({ session });
      await session.commitTransaction();
      return { link, code: uniqueCode };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async trackClick(affiliateId: string, courseId: string, code: string, ip: string, userAgent: string): Promise<void> {
    try {
      const user = await User.findById(affiliateId);
      if (!user) return;
      const link = user.affiliateLinks?.find(l => l.code === code);
      if (link) {
        link.clicks += 1;
        await user.save();
      }
      // Store click in temporary storage for 30 days
      const clickKey = `affiliate_click:${code}:${Date.now()}`;
      const RedisService = require('./RedisService').RedisService;
      await RedisService.getInstance().setex(clickKey, 30 * 24 * 60 * 60, { affiliateId, courseId, code, ip, userAgent });
      logger.info(`Affiliate click: ${affiliateId} -> ${courseId}, code=${code}, ip=${ip}, ua=${userAgent}`);
    } catch (error) {
      logger.error('Track click error:', error);
    }
  }

  async registerAffiliateSignup(affiliateCode: string, newUserId: string, courseId?: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Find the affiliate link by code
      const affiliateUser = await User.findOne({ 'affiliateLinks.code': affiliateCode }).session(session);
      if (!affiliateUser) return;
      
      const link = affiliateUser.affiliateLinks.find(l => l.code === affiliateCode);
      if (!link) return;
      
      // Update signups count
      link.signups += 1;
      await affiliateUser.save({ session });
      
      // Create referral record
      const referral = new Referral({
        referrer: affiliateUser._id,
        referred: newUserId,
        level: 1,
        status: 'pending',
        referralCode: affiliateCode,
        type: 'affiliate',
        courseId: link.courseId,
        clickedAt: new Date(),
        registeredAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      });
      await referral.save({ session });
      
      await session.commitTransaction();
      logger.info(`Affiliate signup: ${affiliateUser._id} referred ${newUserId} with code ${affiliateCode}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error('Register affiliate signup error:', error);
    } finally {
      session.endSession();
    }
  }

  async processAffiliateConversion(userId: string, courseId: string, amount: number, transactionId: mongoose.Types.ObjectId): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Find pending affiliate referral for this user and course
      const referral = await Referral.findOne({ 
        referred: userId, 
        type: 'affiliate', 
        courseId, 
        status: 'pending' 
      }).session(session);
      
      if (!referral) return;
      
      const affiliateUser = await User.findById(referral.referrer).session(session);
      if (!affiliateUser) return;
      
      const link = affiliateUser.affiliateLinks.find(l => l.code === referral.referralCode);
      if (!link) return;
      
      const course = await Course.findById(courseId).session(session);
      if (!course) return;
      
      const commissionAmount = (amount * (course.affiliatePercent || 15)) / 100;
      
      // Update conversion stats
      link.conversions += 1;
      link.totalEarned += commissionAmount;
      await affiliateUser.save({ session });
      
      // Update referral status
      referral.status = 'completed';
      referral.firstPurchaseAt = new Date();
      referral.totalCommission += commissionAmount;
      referral.commissions.push({
        amount: commissionAmount,
        type: 'affiliate_sale',
        transactionId,
        createdAt: new Date()
      });
      await referral.save({ session });
      
      // Add commission to affiliate's wallet
      const EarningEngine = require('./EarningEngine').EarningEngine;
      await EarningEngine.getInstance().addToWallet(affiliateUser._id.toString(), commissionAmount, 'affiliate', { 
        courseId, 
        referralId: referral._id,
        commissionRate: course.affiliatePercent
      }, session);
      
      await session.commitTransaction();
      logger.info(`Affiliate conversion: ${affiliateUser._id} earned ₦${commissionAmount} from user ${userId}`);
    } catch (error) {
      await session.abortTransaction();
      logger.error('Process affiliate conversion error:', error);
    } finally {
      session.endSession();
    }
  }

  async getAffiliateStats(userId: string): Promise<any> {
    const user = await User.findById(userId).populate('affiliateLinks.courseId', 'title');
    if (!user) throw new Error('User not found');
    
    const affiliateReferrals = await Referral.find({ referrer: userId, type: 'affiliate' })
      .populate('courseId', 'title')
      .populate('referred', 'firstName lastName email');
    
    const links = (user.affiliateLinks || []).map(link => {
      const referralsForLink = affiliateReferrals.filter(r => r.courseId?._id.toString() === link.courseId?._id.toString());
      const conversions = referralsForLink.filter(r => r.status === 'completed').length;
      const totalEarned = referralsForLink.reduce((sum, r) => sum + r.totalCommission, 0);
      return {
        courseId: link.courseId?._id,
        courseTitle: link.courseTitle || link.courseId?.title || 'Course',
        link: link.link,
        code: link.code,
        clicks: link.clicks || 0,
        signups: link.signups || 0,
        conversions,
        commissionRate: link.commissionRate,
        totalEarned,
        createdAt: link.createdAt
      };
    });
    
    const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);
    const totalSignups = links.reduce((sum, l) => sum + l.signups, 0);
    const totalConversions = links.reduce((sum, l) => sum + l.conversions, 0);
    const totalEarned = links.reduce((sum, l) => sum + l.totalEarned, 0);
    
    return { totalClicks, totalSignups, totalConversions, totalEarned, links };
  }

  async getTopAffiliates(limit: number = 10): Promise<any[]> {
    const users = await User.aggregate([
      { $match: { 'affiliateLinks.0': { $exists: true } } },
      { $project: {
          firstName: 1,
          lastName: 1,
          displayName: 1,
          avatar: 1,
          totalAffiliateEarnings: { $sum: '$affiliateLinks.totalEarned' },
          totalAffiliateConversions: { $sum: '$affiliateLinks.conversions' },
          totalAffiliateClicks: { $sum: '$affiliateLinks.clicks' },
          affiliateLinksCount: { $size: '$affiliateLinks' }
        } },
      { $sort: { totalAffiliateEarnings: -1 } },
      { $limit: limit }
    ]);
    return users;
  }
}
