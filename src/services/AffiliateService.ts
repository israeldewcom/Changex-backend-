import mongoose from 'mongoose';
import { AffiliateClick } from '../models/AffiliateClick';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Transaction } from '../models/Transaction';
import { Referral } from '../models/Referral';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class AffiliateService {
  private static instance: AffiliateService;
  private constructor() {}
  
  static getInstance(): AffiliateService {
    if (!AffiliateService.instance) {
      AffiliateService.instance = new AffiliateService();
    }
    return AffiliateService.instance;
  }

  async generateAffiliateLink(userId: string, courseId: string): Promise<{ code: string; link: string }> {
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);
    if (!user || !course) throw new Error('User or course not found');

    const existing = user.affiliateLinks.find(l => l.courseId.toString() === courseId);
    if (existing) {
      return {
        code: existing.code || crypto.randomBytes(6).toString('hex').toUpperCase(),
        link: `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}/${existing.code || 'new'}`
      };
    }

    let code: string;
    let isUnique = false;
    do {
      code = crypto.randomBytes(6).toString('hex').toUpperCase();
      const existingCode = await User.findOne({ 'affiliateLinks.code': code });
      if (!existingCode) isUnique = true;
    } while (!isUnique);

    user.affiliateLinks.push({
      courseId: new mongoose.Types.ObjectId(courseId),
      code,
      clicks: 0,
      conversions: 0,
      totalEarned: 0,
      createdAt: new Date()
    });
    await user.save();

    const fullLink = `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}/${code}`;
    return { code, link: fullLink };
  }

  async acceptAffiliateOffer(userId: string, courseId: string): Promise<{ code: string; link: string }> {
    return this.generateAffiliateLink(userId, courseId);
  }

  async trackClick(affiliateUserId: string, courseId: string, code: string, req: any): Promise<void> {
    const user = await User.findById(affiliateUserId);
    if (!user) throw new Error('Affiliate user not found');
    const affiliateLink = user.affiliateLinks.find(l => l.courseId.toString() === courseId && l.code === code);
    if (!affiliateLink) throw new Error('Invalid affiliate link');
    
    affiliateLink.clicks += 1;
    await user.save();
    
    await AffiliateClick.create({
      affiliateLinkId: affiliateLink._id!,
      affiliateUserId: affiliateUserId,
      courseId,
      ip: req.ip || req.socket.remoteAddress || '',
      userAgent: req.get('user-agent') || '',
      referrer: req.get('referer'),
      clickedAt: new Date()
    });
    
    logger.info(`Affiliate click tracked: ${affiliateUserId}, course ${courseId}, code ${code}`);
  }

  async getMyAffiliateLinks(userId: string): Promise<any[]> {
    const user = await User.findById(userId).populate('affiliateLinks.courseId', 'title price affiliateCommission');
    if (!user) return [];
    return user.affiliateLinks.map(link => ({
      id: link._id,
      courseId: link.courseId,
      courseTitle: (link.courseId as any)?.title || 'Course',
      code: link.code,
      clicks: link.clicks,
      conversions: link.conversions,
      totalEarned: link.totalEarned,
      link: `${process.env.FRONTEND_URL}/aff/${user._id}/${link.courseId}/${link.code}`
    }));
  }

  async getAffiliateStats(userId: string): Promise<any> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const totalClicks = user.affiliateLinks.reduce((sum, l) => sum + (l.clicks || 0), 0);
    const totalConversions = user.affiliateLinks.reduce((sum, l) => sum + (l.conversions || 0), 0);
    const totalEarned = user.affiliateLinks.reduce((sum, l) => sum + (l.totalEarned || 0), 0);
    return { totalClicks, totalConversions, totalEarned, linksCount: user.affiliateLinks.length };
  }

  async processAffiliateConversion(buyerId: string, courseId: string, transactionId: mongoose.Types.ObjectId, session?: mongoose.ClientSession): Promise<void> {
    const click = await AffiliateClick.findOne({
      affiliateUserId: { $ne: buyerId },
      courseId,
      converted: false
    }).sort({ clickedAt: -1 });
    if (!click) return;
    
    click.converted = true;
    click.conversionAt = new Date();
    click.transactionId = transactionId;
    await click.save();
    
    const affiliate = await User.findById(click.affiliateUserId);
    if (!affiliate) return;
    const affiliateLink = affiliate.affiliateLinks.find(l => l._id!.equals(click.affiliateLinkId));
    if (!affiliateLink) return;
    const course = await Course.findById(courseId);
    if (!course) return;
    const transaction = await Transaction.findById(transactionId);
    const amount = transaction?.amount || 0;
    const commissionPercent = course.affiliateCommission || 20;
    const commission = amount * (commissionPercent / 100);
    if (commission <= 0) return;
    
    affiliate.walletBalance += commission;
    affiliate.totalEarned += commission;
    affiliateLink.totalEarned += commission;
    affiliateLink.conversions += 1;
    await affiliate.save();
    
    const commissionTx = new Transaction({
      user: affiliate._id,
      type: 'commission',
      subtype: 'affiliate',
      amount: commission,
      currency: course.currency || 'NGN',
      status: 'completed',
      description: `Affiliate commission for "${course.title}"`,
      reference: `AFF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: { courseId, buyerId, commissionPercent, clickId: click._id },
      fromUserId: buyerId,
      toUserId: affiliate._id,
      completedAt: new Date()
    });
    await commissionTx.save();
    logger.info(`Affiliate commission ${commission} to ${affiliate._id} for course ${courseId}`);
  }

  async processReferralSignup(referralCode: string, newUserId: string, session?: mongoose.ClientSession): Promise<void> {
    const referrer = await User.findOne({ referralCode });
    if (!referrer) return;
    
    let level = 1;
    let currentReferrer = referrer;
    while (currentReferrer.referredBy && level < 3) {
      level++;
      currentReferrer = await User.findById(currentReferrer.referredBy);
      if (!currentReferrer) break;
    }
    
    const referral = new Referral({
      referrer: referrer._id,
      referred: newUserId,
      level,
      referralCode,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await referral.save();
    await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id, referralLevel: level });
    await User.findByIdAndUpdate(referrer._id, { $push: { referrals: newUserId } });
  }

  async processReferralUpgrade(userId: string, amountPaid: number, transactionId: mongoose.Types.ObjectId, session?: mongoose.ClientSession): Promise<void> {
    const user = await User.findById(userId);
    if (!user || !user.referredBy) return;
    const referral = await Referral.findOne({ referred: userId, status: 'pending' });
    if (!referral) return;
    referral.status = 'active';
    referral.firstPurchaseAt = new Date();
    await referral.save();
    const bonusAmount = Math.min(amountPaid * 0.2, 5000);
    const referrer = await User.findById(referral.referrer);
    if (referrer && bonusAmount > 0) {
      referrer.walletBalance += bonusAmount;
      referrer.referralEarnings += bonusAmount;
      await referrer.save();
      const bonusTx = new Transaction({
        user: referrer._id,
        type: 'commission',
        subtype: 'referral',
        amount: bonusAmount,
        currency: 'NGN',
        status: 'completed',
        description: `Referral bonus for user upgrade`,
        reference: `REF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metadata: { referredUserId: userId, level: referral.level, amountPaid },
        fromUserId: userId,
        toUserId: referrer._id,
        completedAt: new Date()
      });
      await bonusTx.save();
      logger.info(`Referral bonus ${bonusAmount} to ${referrer.email}`);
    }
  }
}
