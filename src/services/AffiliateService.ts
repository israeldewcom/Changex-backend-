// ============================================
// FILE: src/services/AffiliateService.ts
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

  async acceptAffiliateOffer(userId: string, courseId: string): Promise<{ link: string }> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(userId).session(session);
      const course = await Course.findById(courseId).session(session);
      if (!user || !course) throw new Error('User or course not found');
      if (!course.hasAffiliate) throw new Error('Affiliate not enabled for this course');

      const alreadyAccepted = user.affiliateLinks?.some(l => l.courseId?.toString() === courseId);
      if (alreadyAccepted) {
        const existing = user.affiliateLinks.find(l => l.courseId?.toString() === courseId);
        return { link: existing!.link };
      }

      const uniqueId = Math.random().toString(36).substr(2, 8);
      const link = `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}/${uniqueId}`;
      if (!user.affiliateLinks) user.affiliateLinks = [];
      user.affiliateLinks.push({
        courseId: course._id,
        courseTitle: course.title,
        link,
        clicks: 0,
        signups: 0,
        conversions: 0,
        commissionRate: course.affiliatePercent || 15,
        totalEarned: 0,
        createdAt: new Date()
      });
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

  async trackClick(affiliateId: string, courseId: string, code: string, ip: string, userAgent: string): Promise<void> {
    try {
      const user = await User.findById(affiliateId);
      if (!user) return;
      const link = user.affiliateLinks?.find(l => l.link.includes(code));
      if (link) {
        link.clicks += 1;
        await user.save();
      }
      logger.info(`Affiliate click: ${affiliateId} -> ${courseId}, ip=${ip}, ua=${userAgent}`);
    } catch (error) {
      logger.error('Track click error:', error);
    }
  }

  async registerAffiliateSignup(affiliateId: string, courseId: string, newUserId: string, code: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const referrer = await User.findById(affiliateId).session(session);
      if (!referrer) return;
      const link = referrer.affiliateLinks?.find(l => l.link.includes(code));
      if (link) {
        link.signups += 1;
        await referrer.save({ session });
      }
      const referral = new Referral({
        referrer: affiliateId,
        referred: newUserId,
        level: 1,
        status: 'pending',
        referralCode: referrer.referralCode,
        type: 'affiliate',
        courseId,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      });
      await referral.save({ session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      logger.error('Register affiliate signup error:', error);
    } finally {
      session.endSession();
    }
  }

  async getAffiliateStats(userId: string): Promise<any> {
    const user = await User.findById(userId).populate('affiliateLinks.courseId', 'title');
    if (!user) throw new Error('User not found');
    const affiliateReferrals = await Referral.find({ referrer: userId, type: 'affiliate' }).populate('courseId', 'title');
    const links = (user.affiliateLinks || []).map(link => {
      const referralsForLink = affiliateReferrals.filter(r => r.courseId?._id.toString() === link.courseId?._id.toString());
      const conversions = referralsForLink.filter(r => r.status === 'completed').length;
      const totalEarned = referralsForLink.reduce((sum, r) => sum + r.totalCommission, 0);
      return {
        courseId: link.courseId?._id,
        courseTitle: link.courseTitle || link.courseId?.title || 'Course',
        link: link.link,
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
      { $project: { firstName: 1, lastName: 1, displayName: 1, avatar: 1, totalAffiliateEarnings: { $sum: '$affiliateLinks.totalEarned' }, totalAffiliateConversions: { $sum: '$affiliateLinks.conversions' }, affiliateLinksCount: { $size: '$affiliateLinks' } } },
      { $sort: { totalAffiliateEarnings: -1 } },
      { $limit: limit }
    ]);
    return users;
  }
}
