import { User, Course, Transaction } from '../models';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

export class AffiliateService {
  private static instance: AffiliateService;
  private notificationService: NotificationService;

  private constructor() {
        this.notificationService = NotificationService.getInstance();
  }

  static getInstance(): AffiliateService {
    if (!AffiliateService.instance) {
      AffiliateService.instance = new AffiliateService();
    }
    return AffiliateService.instance;
  }

  // ✅ Track a click on an affiliate link
  async trackClick(affiliateUserId: string, courseId: string, linkCode: string, ip: string, userAgent: string): Promise<void> {
    try {
      const affiliate = await User.findById(affiliateUserId);
      if (!affiliate) return;

      const link = affiliate.affiliateLinks?.find(l => 
        l.courseId.toString() === courseId && l.link.includes(linkCode)
      );
      if (!link) return;

      link.clicks = (link.clicks || 0) + 1;
      
      if (!affiliate.affiliateClicks) affiliate.affiliateClicks = [];
      affiliate.affiliateClicks.push({
        affiliateLinkId: link._id,
        courseId: new mongoose.Types.ObjectId(courseId),
        ip,
        userAgent,
        clickedAt: new Date(),
        converted: false
      });
      
      await affiliate.save();
    } catch (error) {
      logger.error('Error tracking affiliate click:', error);
    }
  }

  // ✅ Track a conversion (user signed up via affiliate link)
  async trackConversion(affiliateCode: string, newUserId: string, session?: mongoose.ClientSession): Promise<void> {
    try {
      const [affiliateId, courseId, linkCode] = affiliateCode.split('|');
      const affiliate = await User.findById(affiliateId).session(session || null);
      if (!affiliate) return;

      const link = affiliate.affiliateLinks?.find(l => 
        l.courseId.toString() === courseId && l.link.includes(linkCode)
      );
      if (!link) return;

      link.signups = (link.signups || 0) + 1;

      // Find and mark the corresponding click
      const click = affiliate.affiliateClicks?.find(c => 
        c.affiliateLinkId.toString() === link._id.toString() && !c.converted
      );
      if (click) {
        click.converted = true;
        click.convertedAt = new Date();
        click.userId = new mongoose.Types.ObjectId(newUserId);
      }

      await affiliate.save({ session });
    } catch (error) {
      logger.error('Error tracking affiliate conversion:', error);
    }
  }

  // ✅ Award commission to affiliate when a purchase is made through their link
  async awardCommission(affiliateCode: string, purchaseAmount: number, transactionId: mongoose.Types.ObjectId, session?: mongoose.ClientSession): Promise<void> {
    try {
      const [affiliateId, courseId] = affiliateCode.split('|');
      const affiliate = await User.findById(affiliateId).session(session || null);
      if (!affiliate) return;

      const link = affiliate.affiliateLinks?.find(l => l.courseId.toString() === courseId);
      if (!link) return;

      const commissionAmount = purchaseAmount * (link.commissionRate / 100);
      link.conversions = (link.conversions || 0) + 1;
      link.totalEarned = (link.totalEarned || 0) + commissionAmount;
      
      // Add to affiliate's wallet
      affiliate.walletBalance += commissionAmount;
      affiliate.totalEarned += commissionAmount;
      await affiliate.save({ session });

      // Create transaction record for affiliate
      const transaction = new Transaction({
        user: affiliate._id,
        type: 'commission',
        subtype: 'affiliate',
        amount: commissionAmount,
        currency: 'NGN',
        status: 'completed',
        description: `Affiliate commission from course sale (${link.commissionRate}%)`,
        reference: `AFF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metadata: { 
          affiliateLinkId: link._id,
          courseId,
          originalAmount: purchaseAmount,
          commissionRate: link.commissionRate
        },
        completedAt: new Date()
      });
      await transaction.save({ session });

      // Notify affiliate
      await this.notificationService.sendNotification(affiliate._id.toString(), 'payment', {
        title: 'Affiliate Commission Earned! 🎉',
        message: `You earned ₦${commissionAmount.toLocaleString()} from a course sale via your affiliate link.`,
        metadata: { amount: commissionAmount, courseId, transactionId: transaction._id }
      });
    } catch (error) {
      logger.error('Error awarding affiliate commission:', error);
    }
  }

  // ✅ Get affiliate statistics for a user
  async getAffiliateStats(userId: string): Promise<any> {
    const user = await User.findById(userId).populate('affiliateLinks.courseId', 'title thumbnail');
    if (!user) return null;

    const stats = {
      totalClicks: 0,
      totalSignups: 0,
      totalConversions: 0,
      totalEarned: 0,
      activeLinks: user.affiliateLinks?.length || 0,
      links: user.affiliateLinks?.map(link => ({
        courseId: link.courseId,
        courseTitle: link.courseTitle,
        link: link.link,
        clicks: link.clicks || 0,
        signups: link.signups || 0,
        conversions: link.conversions || 0,
        earned: link.totalEarned || 0,
        commissionRate: link.commissionRate,
        createdAt: link.createdAt
      })) || []
    };

    for (const link of user.affiliateLinks || []) {
      stats.totalClicks += link.clicks || 0;
      stats.totalSignups += link.signups || 0;
      stats.totalConversions += link.conversions || 0;
      stats.totalEarned += link.totalEarned || 0;
    }

    return stats;
  }

  // ✅ Get top affiliates for leaderboard
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
          affiliateLinksCount: { $size: '$affiliateLinks' }
        } },
      { $sort: { totalAffiliateEarnings: -1 } },
      { $limit: limit }
    ]);
    return users;
  }
}
