// ============================================================
// FILE: src/controllers/payment.controller.ts (UPDATED – article + meeting payments)
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
// 2. VERIFY PAYSTACK TRANSACTION – FULL LOGIC
// ──────────────────────────────────────────────────────────────────────
export const verifyTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference, courseId, bookId, articleId, meetingId } = req.body;
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

    // ─── COURSE PURCHASE ──────────────────────────────────────────────────
    if (type === 'course_purchase' && courseIdFromMeta) {
      const course = await Course.findById(courseIdFromMeta);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      const price = course.salePrice || course.price || 0;

      const existingEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
      if (!existingEnrollment) {
        await Enrollment.create({ userId: user._id, courseId: course._id });
        course.totalStudents += 1;
        await course.save();
      }

      let affiliateCommission = 0;
      let affiliateUserId = null;

      const affiliateCode = meta.affiliateCode;
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

      const referralCode = meta.referralCode;
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
            description: `Commission for course: ${course.title}${affiliateCode ? ' (affiliate)' : ' (referral affiliate)'}`,
            reference,
            metadata: { courseId: course._id },
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
            description: `Sale of course (net after affiliate): ${course.title}`,
            reference,
            metadata: { courseId: course._id },
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
    }

    // ─── SUBSCRIPTION (Premium / Elite) ──────────────────────────────────
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

      const referralCode = meta.referralCode;
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
          await Referral.findOneAndUpdate(
            { referredId: user._id, status: 'pending' },
            { status: 'converted', earned: bonus }
          );
        }
      }
    }

    // ─── BOOK PURCHASE ──────────────────────────────────────────────────────
    else if (type === 'book_purchase' && bookIdFromMeta) {
      const book = await Book.findById(bookIdFromMeta);
      if (!book) {
        return res.status(404).json({ success: false, message: 'Book not found' });
      }

      const price = book.price || 0;
      if (price <= 0) {
        return res.status(400).json({ success: false, message: 'Book is free' });
      }

      // --- Revenue Split ---
      let affiliateCommission = 0;
      let affiliateUserId = null;

      // 1. Check affiliate code
      const affiliateCode = meta.affiliateCode;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const targetId = affiliateLink.bookId || affiliateLink.courseId;
          if (targetId && targetId.toString() === book._id.toString()) {
            const percent = book.affiliatePercent || 0;
            affiliateCommission = price * (percent / 100);
            affiliateLink.conversions += 1;
            affiliateLink.totalEarned = (affiliateLink.totalEarned || 0) + affiliateCommission;
            await affiliateLink.save();
            affiliateUserId = affiliateLink.userId;
          }
        }
      }

      // 2. Admin share (20% of remaining after affiliate)
      const remainingAfterAffiliate = price - affiliateCommission;
      const adminShare = remainingAfterAffiliate * 0.20;
      const authorShare = remainingAfterAffiliate - adminShare;

      // 3. Credit author
      if (authorShare > 0) {
        const author = await User.findById(book.authorId);
        if (author) {
          author.walletBalance = (author.walletBalance || 0) + authorShare;
          await author.save();
          await Transaction.create({
            userId: author._id,
            type: 'book_author_earning',
            amount: authorShare,
            status: 'completed',
            reference,
            description: `Earnings from book: ${book.title}`,
            metadata: { bookId: book._id },
          });
        }
      }

      // 4. Credit affiliate
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
            reference,
            description: `Affiliate commission for book: ${book.title}`,
            metadata: { bookId: book._id },
          });
        }
      }

      // 5. Credit admin/platform (20%)
      const adminUser = await User.findOne({ roles: 'admin' });
      if (adminUser && adminShare > 0) {
        adminUser.walletBalance = (adminUser.walletBalance || 0) + adminShare;
        await adminUser.save();
        await Transaction.create({
          userId: adminUser._id,
          type: 'platform_fee',
          amount: adminShare,
          status: 'completed',
          reference,
          description: `Platform fee (20%) for book: ${book.title}`,
          metadata: { bookId: book._id },
        });
      }

      // 6. Record user purchase
      await Transaction.create({
        userId: user._id,
        type: 'book_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Purchase of book: ${book.title}`,
        metadata: { bookId: book._id },
      });

      // 7. Increment downloads
      book.downloads = (book.downloads || 0) + 1;
      await book.save();

      // 8. Mark purchase record for future downloads
      await ArticlePurchase.findOneAndUpdate(
        { userId: user._id, postId: book._id },
        { status: 'completed', completedAt: new Date() },
        { upsert: true }
      );
    }

    // ─── ARTICLE PURCHASE ──────────────────────────────────────────────────
    else if (type === 'article_purchase' && articleIdFromMeta) {
      const post = await Post.findById(articleIdFromMeta);
      if (!post) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }

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

      const referralCode = meta.referralCode;
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
        }
      }
    }

    // ─── MEETING BOOKING ──────────────────────────────────────────────────
    else if (type === 'meeting_booking' && meetingIdFromMeta) {
      // Handle meeting payment – update meeting status
      await Transaction.create({
        userId: user._id,
        type: 'meeting_booking',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: 'Meeting booking payment',
        metadata: { meetingId: meetingIdFromMeta },
      });
    }

    res.json({ success: true, message: 'Payment verified' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// ─── SUBSCRIBE (Premium / Elite) ──────────────────────────────────────
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
  } catch (err) { next(err); }
};

// ─── WITHDRAW ──────────────────────────────────────────────────────
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { amount } = req.body;
    if (amount < 2000) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
    if (amount > user.walletBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });

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

    res.json({ success: true, message: 'Withdrawal request submitted', fee, netAmount });
  } catch (err) { next(err); }
};

// ─── GET PAYMENT METHODS ─────────────────────────────────────────────
export const getPaymentMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const bankAccounts = user.bankAccount ? [user.bankAccount] : [];
    res.json({ success: true, data: { bankAccounts } });
  } catch (err) { next(err); }
};

// ─── MANUAL PAYMENT SUBMISSION ──────────────────────────────────────
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('📥 Manual payment request received');
    const user = req.user as IUser;
    if (!user) {
      console.log('❌ No user authenticated');
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { type, courseId, bookId, amount, reference, paymentDate, referralCode, affiliateCode } = req.body;
    const file = req.file;

    console.log('📦 Request body:', { type, amount, reference, paymentDate });
    console.log('📎 File:', file ? `Received: ${file.originalname} (${file.size} bytes)` : 'No file');

    if (!file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ success: false, message: 'Receipt file is required' });
    }
    if (!reference || !amount || !paymentDate) {
      console.log('❌ Missing fields');
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const allowedTypes = ['course', 'subscription', 'book', 'article', 'meeting'];
    if (!allowedTypes.includes(type)) {
      console.log('❌ Invalid type:', type);
      return res.status(400).json({ success: false, message: 'Invalid payment type. Allowed: course, subscription, book, article, meeting' });
    }

    let expectedAmount = 0;
    let courseTitle = '';
    let bookTitle = '';
    let articleTitle = '';
    let metadata: any = { referralCode, affiliateCode };

    if (type === 'subscription') {
      expectedAmount = Number(process.env.SUBSCRIPTION_PRICE) || 5000;
      console.log(`📌 Subscription expected amount: ₦${expectedAmount}`);
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        console.log('❌ Course not found:', courseId);
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      expectedAmount = course.salePrice || course.price || 0;
      courseTitle = course.title;
      metadata.courseId = courseId;
      console.log(`📌 Course "${courseTitle}" expected amount: ₦${expectedAmount}`);
    } else if (type === 'book' && bookId) {
      const book = await Book.findById(bookId);
      if (!book) {
        console.log('❌ Book not found:', bookId);
        return res.status(404).json({ success: false, message: 'Book not found' });
      }
      expectedAmount = book.price || 0;
      bookTitle = book.title;
      metadata.bookId = bookId;
      console.log(`📌 Book "${bookTitle}" expected amount: ₦${expectedAmount}`);
    } else if (type === 'article' && req.body.articleId) {
      const post = await Post.findById(req.body.articleId);
      if (!post) {
        console.log('❌ Article not found:', req.body.articleId);
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      expectedAmount = post.price || 0;
      articleTitle = post.title;
      metadata.articleId = post._id;
      console.log(`📌 Article "${articleTitle}" expected amount: ₦${expectedAmount}`);
    } else if (type === 'meeting' && req.body.meetingId) {
      const meeting = await (await import('../models/Meeting.js')).default.findById(req.body.meetingId);
      if (!meeting) {
        console.log('❌ Meeting not found:', req.body.meetingId);
        return res.status(404).json({ success: false, message: 'Meeting not found' });
      }
      expectedAmount = meeting.price || 0;
      metadata.meetingId = meeting._id;
      console.log(`📌 Meeting expected amount: ₦${expectedAmount}`);
    }

    if (expectedAmount <= 0) {
      console.log('❌ Invalid expected amount:', expectedAmount);
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    // Upload receipt to Cloudinary
    let receiptUrl;
    try {
      console.log('☁️ Uploading receipt to Cloudinary...');
      const uploadResult = await uploadToCloudinary(file.buffer, 'manual_payments');
      receiptUrl = uploadResult.secure_url;
      console.log('✅ Receipt uploaded:', receiptUrl);
    } catch (uploadError) {
      console.error('❌ Cloudinary upload failed:', uploadError);
      return res.status(500).json({ success: false, message: 'Receipt upload failed. Please try again.' });
    }

    // Check for duplicate reference
    console.log('🔍 Checking duplicate reference:', reference.toUpperCase());
    const existing = await ManualPayment.findOne({ reference: reference.toUpperCase() });
    if (existing) {
      console.log('❌ Duplicate reference found');
      return res.status(400).json({ success: false, message: 'This reference has already been used. Please use a unique transaction reference.' });
    }

    // Validate payment details
    console.log('🔎 Validating payment details...');
    const validation = await validateManualPayment(
      reference,
      Number(amount),
      new Date(paymentDate),
      expectedAmount,
      [] // duplicate check already done manually
    );
    console.log('✅ Validation result:', validation);

    // Create manual payment record
    console.log('💾 Creating manual payment record...');
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
      adminNote: validation.isValid ? 'Valid format, pending admin review' : 'Format validation failed – admin review required',
      metadata,
    });
    console.log('✅ Manual payment created:', manualPayment._id);

    // Notify admins
    console.log('🔔 Notifying admins...');
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
        reason: validation.isValid ? 'Valid payment, awaiting admin approval' : validation.reason || 'Format mismatch, manual review required',
        createdAt: manualPayment.createdAt,
      });
      await Notification.create({
        userId: admin._id,
        title: '📋 Manual Payment Pending Review',
        message: `${user.firstName} ${user.lastName} submitted a manual payment of ₦${amount.toLocaleString()} for ${type}. Reference: ${reference}`,
        type: 'system',
        data: { paymentId: manualPayment._id, type: 'manual_payment_review' },
      });
    }

    await Notification.create({
      userId: user._id,
      title: '⏳ Payment Submitted for Review',
      message: `Your manual payment of ₦${amount.toLocaleString()} for ${type === 'course' ? courseTitle : type === 'book' ? bookTitle : type === 'article' ? articleTitle : type} has been submitted. An admin will review it shortly. You will be notified once approved.`,
      type: 'payment',
    });

    res.json({
      success: true,
      message: validation.isValid
        ? 'Payment submitted for admin review. You will be notified once approved.'
        : 'Payment submitted for admin review. Please ensure all details are correct.',
      autoApproved: false,
      data: manualPayment,
    });
  } catch (err) {
    console.error('❌ Manual payment error:', err);
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
  } catch (err) { next(err); }
};

export const getUserManualPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const payments = await ManualPayment.find({ userId: user._id }).sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
};

// ─── PURCHASE BOOK (Paystack) ──────────────────────────────────────
export const purchaseBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, message: 'Book ID required' });

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    const metadata = { type: 'book_purchase', bookId: book._id, userId: user._id };
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      {
        email: user.email,
        amount: book.price * 100,
        currency: 'NGN',
        metadata,
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({
      success: true,
      data: {
        paymentUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
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
    res.json({ success: true, message: 'Subscription cancelled successfully.' });
  } catch (err) { next(err); }
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

    res.json({ success: true, message: '🎉 ₦500 welcome bonus added to your wallet!' });
  } catch (err) { next(err); }
};
