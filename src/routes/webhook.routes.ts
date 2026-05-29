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
      res.status(400).send('Invalid signature');
      return;
    }

    const event = req.body;
    if (event.event === 'charge.success') {
      const meta = event.data.metadata;
      if (meta.type === 'course_purchase') {
        // Enroll student
        await Enrollment.findOneAndUpdate(
          { userId: meta.userId, courseId: meta.courseId },
          {},
          { upsert: true, new: true }
        );
        await Course.findByIdAndUpdate(meta.courseId, { $inc: { totalStudents: 1 } });
        
        // ✅ INSTRUCTOR EARNINGS (80% of price)
        const course = await Course.findById(meta.courseId).populate('instructorId');
        if (course && course.instructorId) {
          const price = course.salePrice || course.price || 0;
          const instructorShare = price * 0.8; // 80% to instructor
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
        
        // ✅ AFFILIATE COMMISSION (if affiliate code provided in metadata)
        const affiliateCode = meta.affiliateCode;
        if (affiliateCode) {
          const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode }).populate('courseId');
          if (affiliateLink) {
            const course = await Course.findById(affiliateLink.courseId);
            if (course) {
              const price = course.salePrice || course.price || 0;
              const percent = affiliateLink.courseId?.affiliatePercent || 15;
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
                  description: `Commission for course: ${course.title}`,
                });
              }
            }
          }
        }
      } else if (meta.type === 'subscription') {
        // Mark user as premium
        const user = await User.findById(meta.userId);
        if (user) {
          user.isPremium = true;
          user.subscriptionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await user.save();
          
          // ✅ REFERRAL BONUS (₦500) – check if this user was referred
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

      // Record main transaction (already in your original code – keep it)
      await Transaction.create({
        userId: meta.userId,
        type: meta.type,
        amount: event.data.amount / 100,
        status: 'completed',
        reference: event.data.reference,
      });
    }
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

export default router;
