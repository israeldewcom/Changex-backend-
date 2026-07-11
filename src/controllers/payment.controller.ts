// ============================================================
// FILE: src/controllers/payment.controller.ts (FIXED – removed duplicate and missing references)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import ManualPayment from '../models/ManualPayment.js';
import Book from '../models/Book.js';
import AffiliateLink from '../models/AffiliateLink.js';
import Referral from '../models/Referral.js';
import ArticlePurchase from '../models/ArticlePurchase.js';
import Post from '../models/Post.js';
import Campaign from '../models/Campaign.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { validateManualPayment } from '../services/manualPaymentValidator.js';
import { getIO } from '../socket.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ──────────────────────────────────────────────────────────────────────
// 1. INITIALIZE PAYSTACK TRANSACTION
// ──────────────────────────────────────────────────────────────────────
export const initializeTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });
    const { email, amount, currency = 'NGN', metadata } = req.body;
    let finalMetadata = metadata || {};
    if (!finalMetadata.referralCode && user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) finalMetadata.referralCode = referrer.referralCode;
    }
    const userEmail = email || user.email;
    if (!userEmail) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Valid amount is required' });

    finalMetadata.userId = user._id;

    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      { email: userEmail, amount: amount * 100, currency, metadata: finalMetadata },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, data: response.data.data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// ──────────────────────────────────────────────────────────────────────
// 2. VERIFY TRANSACTION – MAIN LOGIC
// ──────────────────────────────────────────────────────────────────────
export const verifyTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference, courseId, bookId, articleId, meetingId, campaignId } = req.body;
    const user = req.user as IUser;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

    const verification = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = verification.data.data;
    if (data.status !== 'success') return res.status(400).json({ success: false, message: 'Payment not successful' });

    const meta = data.metadata || {};
    const type = meta.type || 'course_purchase';
    let courseIdFromMeta = meta.courseId || courseId;
    let bookIdFromMeta = meta.bookId || bookId;
    let articleIdFromMeta = meta.articleId || articleId;
    let meetingIdFromMeta = meta.meetingId || meetingId;
    let campaignIdFromMeta = meta.campaignId || campaignId;
    const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;
    const affiliateCode = meta.affiliateCode ? String(meta.affiliateCode).trim() : null;

    // ─── COURSE PURCHASE ──────────────────────────────────────────────
    if (type === 'course_purchase' && courseIdFromMeta) {
      const course = await Course.findById(courseIdFromMeta);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      const price = course.salePrice || course.price || 0;

      const existingEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
      if (!existingEnrollment) {
        await Enrollment.create({ userId: user._id, courseId: course._id });
        course.totalStudents += 1;
        await course.save();
      }

      // Affiliate commission
      let affiliateCommission = 0;
      let affiliateUserId = null;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const percent = course.affiliatePercent || 15;
          affiliateCommission = price * (percent / 100);
          affiliateLink.conversions += 1;
          affiliateLink.totalEarned = (affiliateLink.totalEarned || 0) + affiliateCommission;
          await affiliateLink.save();
          affiliateUserId = affiliateLink.userId;
        }
      }

      if (!affiliateCode && referralCode && course.hasAffiliate && course.affiliatePercent > 0) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const percent = course.affiliatePercent || 15;
          affiliateCommission = price * (percent / 100);
          affiliateUserId = referrer._id;
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
            description: `Commission for course: ${course.title}`,
            reference,
            metadata: { courseId: course._id },
          });
          getIO().to(`user:${affiliate._id}`).emit('wallet_updated', {
            userId: affiliate._id,
            balance: affiliate.walletBalance,
          });
        }
      }

      const netAmount = price - affiliateCommission;
      let referralBonus = 0;
      if (!affiliateCommission && referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          referralBonus = netAmount * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + referralBonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: referralBonus,
            status: 'completed',
            description: `Referral commission for course: ${course.title}`,
            reference,
            metadata: { courseId: course._id },
          });
          getIO().to(`user:${referrer._id}`).emit('wallet_updated', {
            userId: referrer._id,
            balance: referrer.walletBalance,
          });
        }
      }

      const instructorShare = netAmount * 0.8;
      if (course.instructorId) {
        const instructor = await User.findById(course.instructorId);
        if (instructor) {
          instructor.walletBalance = (instructor.walletBalance || 0) + instructorShare;
          await instructor.save();
          await Transaction.create({
            userId: instructor._id,
            type: 'instructor_earning',
            amount: instructorShare,
            status: 'completed',
            description: `Sale of course: ${course.title}`,
            reference,
            metadata: { courseId: course._id },
          });
          getIO().to(`user:${instructor._id}`).emit('wallet_updated', {
            userId: instructor._id,
            balance: instructor.walletBalance,
          });
        }
      }

      await Transaction.create({
        userId: user._id,
        type: 'course_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Purchase of course: ${course.title}`,
        metadata: { courseId: course._id },
      });

      getIO().to(`user:${user._id}`).emit('wallet_updated', {
        userId: user._id,
        balance: user.walletBalance,
      });
    }

    // ─── SUBSCRIPTION ──────────────────────────────────────────────────
    else if (type === 'subscription') {
      const plan = meta.plan || 'premium';
      const days = plan === 'elite' ? 30 : 30;

      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        tier: plan,
        subscriptionExpires: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      });

      await Transaction.create({
        userId: user._id,
        type: 'subscription',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription`,
      });

      getIO().to(`user:${user._id}`).emit('premium_updated', {
        userId: user._id,
        isPremium: true,
        tier: plan,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const bonus = plan === 'elite' ? 1000 : 500;
          referrer.walletBalance = (referrer.walletBalance || 0) + bonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: bonus,
            status: 'completed',
            description: `Referral bonus for new ${plan} subscriber: ${user.email}`,
            reference,
          });
          getIO().to(`user:${referrer._id}`).emit('wallet_updated', {
            userId: referrer._id,
            balance: referrer.walletBalance,
          });
          await Referral.findOneAndUpdate(
            { referredId: user._id, status: 'pending' },
            { status: 'converted', earned: bonus }
          );
        }
      }
    }

    // ─── BOOK PURCHASE ──────────────────────────────────────────────────
    else if (type === 'book_purchase' && bookIdFromMeta) {
      const book = await Book.findById(bookIdFromMeta);
      if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

      await Transaction.create({
        userId: user._id,
        type: 'book_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Purchase of book: ${book.title}`,
        metadata: { bookId: book._id },
      });

      book.downloads = (book.downloads || 0) + 1;
      await book.save();

      getIO().to(`user:${user._id}`).emit('book_purchased', {
        bookId: book._id,
        title: book.title,
      });
      getIO().to(`user:${user._id}`).emit('wallet_updated', {
        userId: user._id,
        balance: user.walletBalance,
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
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
            metadata: { bookId: book._id },
          });
          getIO().to(`user:${referrer._id}`).emit('wallet_updated', {
            userId: referrer._id,
            balance: referrer.walletBalance,
          });
        }
      }
    }

    // ─── ARTICLE PURCHASE ──────────────────────────────────────────────
    else if (type === 'article_purchase' && articleIdFromMeta) {
      const post = await Post.findById(articleIdFromMeta);
      if (!post) return res.status(404).json({ success: false, message: 'Article not found' });

      await ArticlePurchase.findOneAndUpdate(
        { userId: user._id, postId: post._id },
        { status: 'completed', completedAt: new Date() },
        { upsert: true }
      );

      await Transaction.create({
        userId: user._id,
        type: 'article_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Purchase of article: ${post.title}`,
        metadata: { postId: post._id },
      });

      getIO().to(`user:${user._id}`).emit('article_purchased', {
        postId: post._id,
        title: post.title,
      });
      getIO().to(`user:${user._id}`).emit('wallet_updated', {
        userId: user._id,
        balance: user.walletBalance,
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
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
            metadata: { postId: post._id },
          });
          getIO().to(`user:${referrer._id}`).emit('wallet_updated', {
            userId: referrer._id,
            balance: referrer.walletBalance,
          });
        }
      }
    }

    // ─── MEETING BOOKING ──────────────────────────────────────────────
    else if (type === 'meeting_booking' && meetingIdFromMeta) {
      await Transaction.create({
        userId: user._id,
        type: 'meeting_booking',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: 'Meeting booking payment',
        metadata: { meetingId: meetingIdFromMeta },
      });

      const Meeting = await import('../models/Meeting.js').then(m => m.default);
      const meeting = await Meeting.findById(meetingIdFromMeta);
      if (meeting) {
        meeting.status = 'booked';
        meeting.attendeeId = user._id;
        await meeting.save();
      }
    }

    // ─── CAMPAIGN PAYMENT ─────────────────────────────────────────────
    else if (type === 'campaign_payment' && campaignIdFromMeta) {
      const campaign = await Campaign.findById(campaignIdFromMeta);
      if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

      campaign.paymentStatus = 'paid';
      campaign.escrowBalance = data.amount / 100;
      campaign.totalDeducted = 0;
      campaign.status = 'active';
      campaign.isActive = true;
      campaign.paymentMethod = 'paystack';
      await campaign.save();

      await Transaction.create({
        userId: user._id,
        type: 'campaign_payment',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Campaign payment: ${campaign.title}`,
        metadata: { campaignId: campaign._id },
      });

      getIO().to(`user:${user._id}`).emit('campaign_active', {
        campaignId: campaign._id,
        title: campaign.title,
        paymentMethod: 'paystack',
      });
      getIO().to(`user:${user._id}`).emit('wallet_updated', {
        userId: user._id,
        balance: user.walletBalance,
      });
    }

    res.json({ success: true, message: 'Payment verified' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// ─── SUBSCRIBE ──────────────────────────────────────────────────────
export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { plan = 'premium', referralCode } = req.body;
    let price: number;
    if (plan === 'elite') {
      price = Number(process.env.ELITE_SUBSCRIPTION_PRICE) || 15000;
    } else {
      price = Number(process.env.SUBSCRIPTION_PRICE) || 5000;
    }

    let finalReferralCode = referralCode;
    if (!finalReferralCode && user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) finalReferralCode = referrer.referralCode;
    }

    const metadata = { userId: user._id, type: 'subscription', plan, referralCode: finalReferralCode };
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      { email: user.email, amount: price * 100, currency: 'NGN', metadata },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({ success: true, data: { paymentUrl: response.data.data.authorization_url, reference: response.data.data.reference } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET TRANSACTIONS ────────────────────────────────────────────────
export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { limit = 50 } = req.query;
    const transactions = await Transaction.find({ userId: user._id }).sort('-createdAt').limit(Number(limit));
    res.json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
};

// ─── WITHDRAW ──────────────────────────────────────────────────────
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { amount } = req.body;

    if (amount < 5000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦5,000' });
    }
    if (amount > user.walletBalance) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const feeRate = 0.1;
    const fee = amount * feeRate;
    const netAmount = amount - fee;

    user.walletBalance -= amount;
    user.pendingWithdrawal += netAmount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amount: -amount,
      status: 'pending',
      description: `Withdrawal request (fee: ₦${fee.toLocaleString()})`,
      metadata: { fee, netAmount },
    });

    getIO().to(`user:${user._id}`).emit('wallet_updated', {
      userId: user._id,
      balance: user.walletBalance,
    });

    res.json({ success: true, message: 'Withdrawal request submitted', fee, netAmount });
  } catch (err) {
    next(err);
  }
};

// ─── GET PAYMENT METHODS ─────────────────────────────────────────────
export const getPaymentMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const bankAccounts = user.bankAccount ? [user.bankAccount] : [];
    res.json({ success: true, data: { bankAccounts } });
  } catch (err) {
    next(err);
  }
};

// ─── MANUAL PAYMENT SUBMISSION ──────────────────────────────────────
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { type, courseId, bookId, amount, reference, paymentDate, referralCode, affiliateCode, campaignId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Receipt file is required' });
    }
    if (!reference || !amount || !paymentDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const allowedTypes = ['course', 'subscription', 'book', 'article', 'meeting', 'campaign'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment type' });
    }

    let expectedAmount = 0;
    let title = '';
    let metadata: any = { referralCode, affiliateCode };

    if (type === 'subscription') {
      expectedAmount = Number(process.env.SUBSCRIPTION_PRICE) || 5000;
      title = 'Premium Subscription';
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      expectedAmount = course.salePrice || course.price || 0;
      title = course.title;
      metadata.courseId = courseId;
    } else if (type === 'book' && bookId) {
      const book = await Book.findById(bookId);
      if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
      expectedAmount = book.price || 0;
      title = book.title;
      metadata.bookId = bookId;
    } else if (type === 'article' && req.body.articleId) {
      const post = await Post.findById(req.body.articleId);
      if (!post) return res.status(404).json({ success: false, message: 'Article not found' });
      expectedAmount = post.price || 0;
      title = post.title;
      metadata.articleId = post._id;
    } else if (type === 'campaign' && campaignId) {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
      expectedAmount = campaign.budget || 0;
      title = campaign.title;
      metadata.campaignId = campaignId;
    }

    if (expectedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    // Upload receipt
    let receiptUrl;
    try {
      const uploadResult = await uploadToCloudinary(file.buffer, 'manual_payments');
      receiptUrl = uploadResult.secure_url;
    } catch (uploadError) {
      return res.status(500).json({ success: false, message: 'Receipt upload failed. Please try again.' });
    }

    // Check duplicate reference
    const existing = await ManualPayment.findOne({ reference: reference.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This reference has already been used.' });
    }

    // Validate payment
    const validation = await validateManualPayment(
      reference,
      Number(amount),
      new Date(paymentDate),
      expectedAmount,
      []
    );

    // Create manual payment record
    const manualPayment = await ManualPayment.create({
      userId: user._id,
      type,
      courseId: type === 'course' ? courseId : undefined,
      amount: Number(amount),
      reference: reference.toUpperCase(),
      paymentDate: new Date(paymentDate),
      receiptUrl,
      status: 'pending_review',
      autoDetected: false,
      adminNote: validation.isValid ? 'Valid format, pending admin review' : 'Format validation failed',
      metadata,
    });

    // Notify admins
    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('admin_manual_payment_alert', {
        paymentId: manualPayment._id,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        amount: Number(amount),
        reference,
        type,
        receiptUrl,
        reason: validation.isValid ? 'Valid payment, awaiting admin approval' : validation.reason || 'Manual review required',
      });
      await Notification.create({
        userId: admin._id,
        title: '📋 Manual Payment Pending Review',
        message: `${user.firstName} ${user.lastName} submitted a manual payment of ₦${amount.toLocaleString()} for ${type}${title ? ` (${title})` : ''}. Reference: ${reference}`,
        type: 'system',
        data: { paymentId: manualPayment._id, type: 'manual_payment_review' },
      });
    }

    await Notification.create({
      userId: user._id,
      title: '⏳ Payment Submitted for Review',
      message: `Your manual payment of ₦${amount.toLocaleString()} for ${type}${title ? ` (${title})` : ''} has been submitted. An admin will review it shortly.`,
      type: 'payment',
    });

    res.json({
      success: true,
      message: validation.isValid
        ? 'Payment submitted for admin review. You will be notified once approved.'
        : 'Payment submitted for admin review. Please ensure all details are correct.',
      data: manualPayment,
    });
  } catch (err) {
    console.error('Manual payment error:', err);
    next(err);
  }
};

// ─── GET MANUAL PAYMENT STATUS ──────────────────────────────────────
export const getManualPaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { paymentId } = req.params;
    const payment = await ManualPayment.findOne({ _id: paymentId, userId: user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

export const getUserManualPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const payments = await ManualPayment.find({ userId: user._id }).sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
};

// ─── CANCEL SUBSCRIPTION ────────────────────────────────────────────
export const cancelSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    user.isPremium = false;
    user.tier = 'free';
    user.subscriptionExpires = undefined;
    await user.save();

    getIO().to(`user:${user._id}`).emit('premium_updated', {
      userId: user._id,
      isPremium: false,
      tier: 'free',
    });

    res.json({ success: true, message: 'Subscription cancelled successfully.' });
  } catch (err) {
    next(err);
  }
};

// ─── CLAIM WELCOME BONUS ────────────────────────────────────────────
export const claimWelcomeBonus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if ((user as any).hasClaimedWelcomeBonus) {
      return res.status(400).json({ success: false, message: 'Welcome bonus already claimed' });
    }
    user.walletBalance = (user.walletBalance || 0) + 500;
    (user as any).hasClaimedWelcomeBonus = true;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: 500,
      status: 'completed',
      description: 'Welcome bonus for joining ChangeX',
    });

    getIO().to(`user:${user._id}`).emit('wallet_updated', {
      userId: user._id,
      balance: user.walletBalance,
    });

    res.json({ success: true, message: '🎉 ₦500 welcome bonus added to your wallet!' });
  } catch (err) {
    next(err);
  }
};

// ─── GET WALLET BREAKDOWN ────────────────────────────────────────────
export const getWalletBreakdown = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await Transaction.find({ userId: user._id, status: 'completed' });

    const breakdown: Record<string, number> = {
      referralEarnings: 0,
      affiliateCommissions: 0,
      instructorEarnings: 0,
      courseBonuses: 0,
      welcomeBonus: 0,
      socialEarnings: 0,
      adRevenue: 0,
      campaignRevenue: 0,
      totalEarnings: 0,
    };

    for (const tx of transactions) {
      const amount = tx.amount || 0;
      if (amount <= 0) continue;
      switch (tx.type) {
        case 'referral_bonus':
        case 'referral_commission':
          breakdown.referralEarnings += amount;
          break;
        case 'affiliate_commission':
          breakdown.affiliateCommissions += amount;
          break;
        case 'instructor_earning':
          breakdown.instructorEarnings += amount;
          break;
        case 'bonus':
          if (tx.description?.toLowerCase().includes('welcome')) {
            breakdown.welcomeBonus += amount;
          } else if (tx.description?.toLowerCase().includes('social')) {
            breakdown.socialEarnings += amount;
          } else {
            breakdown.courseBonuses += amount;
          }
          break;
        case 'ad_revenue':
          breakdown.adRevenue += amount;
          break;
        case 'campaign_payment':
          breakdown.campaignRevenue += amount;
          break;
      }
    }

    breakdown.totalEarnings = Object.values(breakdown).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        balance: user.walletBalance || 0,
        pending: user.pendingWithdrawal || 0,
        breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
};
