// ============================================================
// FILE: src/routes/webhook.routes.ts (COMPLETE UPDATED)
// ============================================================

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import AffiliateLink from '../models/AffiliateLink.js';
import Campaign from '../models/Campaign.js';
import { paystackConfig } from '../config/paystack.js';
import { getIO } from '../socket.js';

const router = Router();

// ─── Main Paystack Webhook (handles all charge.success events) ──────
router.post('/paystack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = crypto
      .createHmac('sha512', paystackConfig.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      console.error('[WEBHOOK] Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    if (event.event !== 'charge.success') {
      return res.sendStatus(200);
    }

    const meta = event.data.metadata || {};
    const reference = event.data.reference;
    const amount = event.data.amount / 100;
    const userEmail = event.data.customer?.email || '';

    // ─── Determine transaction type from metadata ──────────────────
    const type = meta.type || 'unknown';

    // ─── CAMPAIGN PAYMENT ───────────────────────────────────────────
    if (type === 'campaign_payment' || type === 'campaign_topup') {
      const campaign = await Campaign.findOne({ paymentReference: reference });
      if (!campaign) {
        console.error(`[WEBHOOK] Campaign not found for reference ${reference}`);
        return res.status(404).send('Campaign not found');
      }

      const user = await User.findById(campaign.userId);
      if (!user) {
        console.error(`[WEBHOOK] User not found for campaign ${campaign._id}`);
        return res.status(404).send('User not found');
      }

      if (type === 'campaign_topup') {
        campaign.escrowBalance += amount;
        campaign.budget += amount;
        await Transaction.create({
          userId: user._id,
          type: 'campaign_topup',
          amount: amount,
          status: 'completed',
          description: `Campaign top-up: ${campaign.title}`,
          reference,
          metadata: { campaignId: campaign._id },
        });
      } else {
        // Initial payment
        campaign.paymentStatus = 'paid';
        campaign.escrowBalance = amount;
        campaign.totalDeducted = 0;
        campaign.status = 'active';
        campaign.isActive = true;
        await Transaction.create({
          userId: user._id,
          type: 'campaign_payment',
          amount: amount,
          status: 'completed',
          description: `Campaign payment: ${campaign.title}`,
          reference,
          metadata: { campaignId: campaign._id },
        });
      }

      await campaign.save();

      // Notify user
      getIO().to(`user:${campaign.userId}`).emit('campaign_active', {
        campaignId: campaign._id,
        title: campaign.title,
      });

      // Notify admins
      const admins = await User.find({ roles: 'admin' }).select('_id');
      for (const admin of admins) {
        getIO().to(`user:${admin._id}`).emit('campaign_paid', {
          campaignId: campaign._id,
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          title: campaign.title,
        });
      }

      return res.sendStatus(200);
    }

    // ─── COURSE PURCHASE ─────────────────────────────────────────────
    if (type === 'course_purchase') {
      const userId = meta.userId;
      const courseId = meta.courseId;
      const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;
      const affiliateCode = meta.affiliateCode ? String(meta.affiliateCode).trim() : null;

      // Create enrollment if not exists
      await Enrollment.findOneAndUpdate(
        { userId, courseId },
        {},
        { upsert: true, new: true }
      );

      const course = await Course.findByIdAndUpdate(
        courseId,
        { $inc: { totalStudents: 1 } },
        { new: true }
      );

      // Instructor earnings (80% after affiliate)
      if (course && course.instructorId) {
        const price = course.salePrice || course.price || 0;
        const instructorShare = price * 0.8;
        const instructor = await User.findById(course.instructorId);
        if (instructor) {
          instructor.walletBalance = (instructor.walletBalance || 0) + instructorShare;
          await instructor.save();
          await Transaction.create({
            userId: instructor._id,
            type: 'instructor_earning',
            amount: instructorShare,
            status: 'completed',
            description: `Course sale: ${course.title}`,
          });
        }
      }

      // Affiliate commission
      let affiliateCommission = 0;
      let affiliateUserId = null;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const price = course?.salePrice || course?.price || 0;
          const percent = course?.affiliatePercent || 15;
          affiliateCommission = price * (percent / 100);
          affiliateLink.conversions += 1;
          affiliateLink.totalEarned += affiliateCommission;
          await affiliateLink.save();
          affiliateUserId = affiliateLink.userId;
        }
      }
      if (affiliateUserId && affiliateCommission > 0) {
        const affiliate = await User.findById(affiliateUserId);
        if (affiliate) {
          affiliate.walletBalance = (affiliate.walletBalance || 0) + affiliateCommission;
          await affiliate.save();
          await Transaction.create({
            userId: affiliate._id,
            type: 'affiliate_commission',
            amount: affiliateCommission,
            status: 'completed',
            description: `Commission for course: ${course?.title}`,
          });
        }
      }

      // Referral commission (only if no affiliate)
      if (referralCode && !affiliateCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== userId) {
          const price = course?.salePrice || course?.price || 0;
          const referrerShare = price * 0.1;
          referrer.walletBalance += referrerShare;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: referrerShare,
            status: 'completed',
            description: `Referral commission for course: ${course?.title}`,
          });
        }
      }

      // Record user purchase transaction
      await Transaction.create({
        userId,
        type: 'course_purchase',
        amount: amount,
        status: 'completed',
        reference,
        description: `Purchase of course: ${course?.title || 'Course'}`,
        metadata: { courseId },
      });

      return res.sendStatus(200);
    }

    // ─── SUBSCRIPTION ───────────────────────────────────────────────
    if (type === 'subscription') {
      const userId = meta.userId;
      const plan = meta.plan || 'premium';
      const days = plan === 'elite' ? 30 : 30;

      const user = await User.findById(userId);
      if (user) {
        user.isPremium = true;
        user.tier = plan;
        user.subscriptionExpires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await user.save();

        await Transaction.create({
          userId: user._id,
          type: 'subscription',
          amount: amount,
          status: 'completed',
          reference,
          description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription`,
        });

        // Referral bonus for subscription
        const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;
        if (referralCode) {
          const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
          if (referrer && referrer._id.toString() !== userId) {
            const bonus = plan === 'elite' ? 1000 : 500;
            referrer.walletBalance = (referrer.walletBalance || 0) + bonus;
            await referrer.save();
            await Transaction.create({
              userId: referrer._id,
              type: 'referral_bonus',
              amount: bonus,
              status: 'completed',
              description: `Referral bonus for ${plan} subscriber: ${user.email}`,
              reference,
            });
            await Referral.findOneAndUpdate(
              { referredId: user._id, status: 'pending' },
              { status: 'converted', earned: bonus }
            );
          }
        }
      }
      return res.sendStatus(200);
    }

    // ─── UNKNOWN TYPE ──────────────────────────────────────────────
    console.warn('[WEBHOOK] Unknown transaction type:', type);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    next(error);
  }
});

export default router;
