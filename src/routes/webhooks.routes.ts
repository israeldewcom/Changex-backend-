// File: src/routes/webhook.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import Notification from '../models/Notification.js';
import { paystackConfig } from '../config/paystack.js';
import AffiliateLink from '../models/AffiliateLink.js';
import logger from '../utils/logger.js';

const router = Router();

router.post('/paystack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify signature
    const hash = crypto.createHmac('sha512', paystackConfig.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      logger.warn('Invalid Paystack webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    logger.info(`Paystack webhook: ${event.event}`);

    if (event.event === 'charge.success') {
      const meta = event.data.metadata;
      if (!meta) return res.sendStatus(200);

      if (meta.type === 'course_purchase') {
        await Enrollment.findOneAndUpdate(
          { userId: meta.userId, courseId: meta.courseId },
          { status: 'active' },
          { upsert: true, new: true }
        );
        await Course.findByIdAndUpdate(meta.courseId, { $inc: { totalStudents: 1 } });
      } else if (meta.type === 'subscription') {
        await User.findByIdAndUpdate(meta.userId, {
          isPremium: true,
          subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        // Process referral bonus for first premium
        const referral = await Referral.findOne({ referredId: meta.userId, status: 'pending' });
        if (referral) {
          const referrer = await User.findById(referral.referrerId);
          if (referrer) {
            const bonus = 500;
            referrer.walletBalance += bonus;
            await referrer.save();
            referral.status = 'converted';
            referral.earned = bonus;
            referral.convertedAt = new Date();
            await referral.save();

            await Transaction.create({
              userId: referrer._id,
              type: 'referral_bonus',
              amount: bonus,
              status: 'completed',
              description: 'Referral bonus for premium subscription',
            });
            await Notification.create({
              userId: referrer._id,
              title: 'Referral Bonus',
              message: `You earned ₦${bonus} because your referral upgraded to Premium!`,
              type: 'payment',
            });
          }
        }
      }

      // Record transaction if not already recorded (idempotent)
      const existingTx = await Transaction.findOne({ reference: event.data.reference });
      if (!existingTx) {
        await Transaction.create({
          userId: meta.userId,
          type: meta.type,
          amount: event.data.amount / 100,
          status: 'completed',
          reference: event.data.reference,
        });
      }

      // Affiliate commission handling (duplicate from payment controller but webhook ensures reliability)
      if (meta.type === 'course_purchase' && meta.affiliateCode && meta.affiliateUserId) {
        const link = await AffiliateLink.findOne({ code: meta.affiliateCode });
        if (link) {
          const course = await Course.findById(meta.courseId);
          const commission = (event.data.amount / 100) * ((course?.affiliatePercent || 15) / 100);
          link.conversions += 1;
          link.totalEarned += commission;
          await link.save();

          await User.findByIdAndUpdate(meta.affiliateUserId, { $inc: { walletBalance: commission } });
          await Transaction.create({
            userId: meta.affiliateUserId,
            type: 'affiliate_commission',
            amount: commission,
            status: 'completed',
            description: `Commission from ${course?.title}`,
          });

          await Notification.create({
            userId: meta.affiliateUserId,
            title: 'Affiliate Sale!',
            message: `You earned ₦${commission} from a sale through your link.`,
            type: 'affiliate',
          });
        }
      }
    }
    res.sendStatus(200);
  } catch (err) {
    logger.error('Webhook error:', err);
    next(err);
  }
});

export default router;
