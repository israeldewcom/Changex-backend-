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

// ─── Main Paystack Webhook ────────────────────────────────────────────
router.post('/paystack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ─── Verify webhook signature ──────────────────────────────────────
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

    console.log(`[WEBHOOK] Processing ${meta.type} | Reference: ${reference} | Amount: ₦${amount}`);

    const type = meta.type || 'unknown';

    // ═══════════════════════════════════════════════════════════════════
    // 1. CAMPAIGN PAYMENT (Initial or Top-up)
    // ═══════════════════════════════════════════════════════════════════
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
        console.log(`[WEBHOOK] Campaign top-up: +₦${amount} to ${campaign.title}`);
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
        console.log(`[WEBHOOK] Campaign activated: ${campaign.title} | Budget: ₦${amount}`);
      }

      await campaign.save();

      // Notify user
      getIO().to(`user:${campaign.userId}`).emit('campaign_active', {
        campaignId: campaign._id,
        title: campaign.title,
        amount: amount,
        type: type === 'campaign_topup' ? 'topup' : 'activation',
      });

      // Notify admins
      const admins = await User.find({ roles: 'admin' }).select('_id');
      for (const admin of admins) {
        getIO().to(`user:${admin._id}`).emit('campaign_paid', {
          campaignId: campaign._id,
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          title: campaign.title,
          amount: amount,
          type: type === 'campaign_topup' ? 'topup' : 'initial',
        });
      }

      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. COURSE PURCHASE
    // ═══════════════════════════════════════════════════════════════════
    if (type === 'course_purchase') {
      const userId = meta.userId;
      const courseId = meta.courseId;
      const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;
      const affiliateCode = meta.affiliateCode ? String(meta.affiliateCode).trim() : null;

      console.log(`[WEBHOOK] Course purchase: User ${userId} | Course ${courseId}`);

      // Create or update enrollment
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
          console.log(`[WEBHOOK] Instructor ${instructor._id} earned ₦${instructorShare}`);
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
          console.log(`[WEBHOOK] Affiliate commission: ₦${affiliateCommission} | Link: ${affiliateCode}`);
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
          console.log(`[WEBHOOK] Referral commission: ₦${referrerShare} | Referrer: ${referrer._id}`);
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

      console.log(`[WEBHOOK] Course purchase completed for user ${userId}`);
      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. SUBSCRIPTION
    // ═══════════════════════════════════════════════════════════════════
    if (type === 'subscription') {
      const userId = meta.userId;
      const plan = meta.plan || 'premium';
      const days = plan === 'elite' ? 30 : 30;

      console.log(`[WEBHOOK] Subscription: User ${userId} | Plan ${plan}`);

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
            console.log(`[WEBHOOK] Referral bonus: ₦${bonus} | Referrer: ${referrer._id}`);
          }
        }

        // Emit socket event
        getIO().to(`user:${user._id}`).emit('subscription_activated', {
          plan,
          expiresAt: user.subscriptionExpires,
        });

        console.log(`[WEBHOOK] Subscription activated for user ${userId}`);
      }
      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. BOOK PURCHASE
    // ═══════════════════════════════════════════════════════════════════
    if (type === 'book_purchase') {
      const userId = meta.userId;
      const bookId = meta.bookId;
      const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;

      console.log(`[WEBHOOK] Book purchase: User ${userId} | Book ${bookId}`);

      const Book = (await import('../models/Book.js')).default;
      const book = await Book.findById(bookId);
      if (book) {
        book.downloads = (book.downloads || 0) + 1;
        await book.save();
      }

      await Transaction.create({
        userId,
        type: 'book_purchase',
        amount: amount,
        status: 'completed',
        reference,
        description: `Purchase of book: ${book?.title || 'Book'}`,
        metadata: { bookId },
      });

      // Referral commission for book
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== userId && book) {
          const bonus = (book.price || 0) * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + bonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: bonus,
            status: 'completed',
            description: `Referral commission for book: ${book.title}`,
            reference,
            metadata: { bookId },
          });
          console.log(`[WEBHOOK] Referral commission (book): ₦${bonus}`);
        }
      }

      console.log(`[WEBHOOK] Book purchase completed for user ${userId}`);
      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. ARTICLE PURCHASE
    // ═══════════════════════════════════════════════════════════════════
    if (type === 'article_purchase') {
      const userId = meta.userId;
      const articleId = meta.articleId;
      const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;

      console.log(`[WEBHOOK] Article purchase: User ${userId} | Article ${articleId}`);

      const ArticlePurchase = (await import('../models/ArticlePurchase.js')).default;
      const Post = (await import('../models/Post.js')).default;

      await ArticlePurchase.findOneAndUpdate(
        { userId, postId: articleId },
        { status: 'completed', completedAt: new Date() },
        { upsert: true }
      );

      const post = await Post.findById(articleId);
      await Transaction.create({
        userId,
        type: 'article_purchase',
        amount: amount,
        status: 'completed',
        reference,
        description: `Purchase of article: ${post?.title || 'Article'}`,
        metadata: { postId: articleId },
      });

      if (referralCode && post) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== userId) {
          const bonus = (post.price || 0) * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + bonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: bonus,
            status: 'completed',
            description: `Referral commission for article: ${post.title}`,
            reference,
            metadata: { postId: articleId },
          });
          console.log(`[WEBHOOK] Referral commission (article): ₦${bonus}`);
        }
      }

      console.log(`[WEBHOOK] Article purchase completed for user ${userId}`);
      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. MEETING BOOKING
    // ═══════════════════════════════════════════════════════════════════
    if (type === 'meeting_booking') {
      const userId = meta.userId;
      const meetingId = meta.meetingId;

      console.log(`[WEBHOOK] Meeting booking: User ${userId} | Meeting ${meetingId}`);

      await Transaction.create({
        userId,
        type: 'meeting_booking',
        amount: amount,
        status: 'completed',
        reference,
        description: 'Meeting booking payment',
        metadata: { meetingId },
      });

      // Optionally update meeting status
      const Meeting = (await import('../models/Meeting.js')).default;
      const meeting = await Meeting.findById(meetingId);
      if (meeting) {
        meeting.status = 'booked';
        meeting.attendeeId = userId;
        await meeting.save();
        console.log(`[WEBHOOK] Meeting ${meetingId} booked by user ${userId}`);
      }

      return res.sendStatus(200);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7. UNKNOWN TYPE
    // ═══════════════════════════════════════════════════════════════════
    console.warn(`[WEBHOOK] Unknown transaction type: ${type}`);
    return res.sendStatus(200);

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    next(error);
  }
});

export default router;
