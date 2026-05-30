import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import AffiliateLink from '../models/AffiliateLink.js';
import { paystackConfig } from '../config/paystack.js';

const router = Router();

router.post('/paystack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = crypto.createHmac('sha512', paystackConfig.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;
    if (event.event === 'charge.success') {
      const meta = event.data.metadata;
      const reference = event.data.reference;
      const amount = event.data.amount / 100;

      let referralCode = meta.referralCode ? meta.referralCode.trim().toUpperCase() : null;
      let affiliateCode = meta.affiliateCode ? meta.affiliateCode.trim() : null;

      if (meta.type === 'course_purchase') {
        await Enrollment.findOneAndUpdate(
          { userId: meta.userId, courseId: meta.courseId },
          {},
          { upsert: true, new: true }
        );
        const course = await Course.findByIdAndUpdate(meta.courseId, { $inc: { totalStudents: 1 } }, { new: true });

        // Instructor commission (80%)
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
        if (affiliateCode) {
          const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
          if (affiliateLink) {
            const courseForAffiliate = await Course.findById(affiliateLink.courseId);
            if (courseForAffiliate) {
              const price = courseForAffiliate.salePrice || courseForAffiliate.price || 0;
              const percent = courseForAffiliate.affiliatePercent || 15;
              const commission = price * (percent / 100);
              affiliateLink.conversions += 1;
              affiliateLink.totalEarned += commission;
              await affiliateLink.save();
              const affiliate = await User.findById(affiliateLink.userId);
              if (affiliate) {
                affiliate.walletBalance = (affiliate.walletBalance || 0) + commission;
                await affiliate.save();
                await Transaction.create({
                  userId: affiliate._id,
                  type: 'affiliate_commission',
                  amount: commission,
                  status: 'completed',
                  description: `Commission for course: ${courseForAffiliate.title}`,
                });
              }
            }
          }
        }

        // Referral commission (10%) – only if no affiliate code
        if (referralCode && !affiliateCode) {
          const referrer = await User.findOne({ referralCode });
          if (referrer && referrer._id.toString() !== meta.userId) {
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
      } 
      else if (meta.type === 'subscription') {
        const user = await User.findById(meta.userId);
        if (user) {
          user.isPremium = true;
          user.subscriptionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await user.save();

          const referral = await Referral.findOne({ referredId: user._id, status: 'pending' });
          if (referral) {
            referral.status = 'converted';
            referral.earned = 500;
            await referral.save();
            const referrer = await User.findById(referral.referrerId);
            if (referrer) {
              referrer.walletBalance = (referrer.walletBalance || 0) + 500;
              await referrer.save();
              await Transaction.create({
                userId: referrer._id,
                type: 'referral_bonus',
                amount: 500,
                status: 'completed',
                description: 'Referral bonus for premium subscription',
              });
            }
          }
        }
      }

      await Transaction.create({
        userId: meta.userId,
        type: meta.type,
        amount: amount,
        status: 'completed',
        reference: reference,
      });
    }
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

export default router;
