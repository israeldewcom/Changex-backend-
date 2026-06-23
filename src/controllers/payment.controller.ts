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
// 2. VERIFY PAYSTACK TRANSACTION – FULL LOGIC (course, subscription, book)
// ──────────────────────────────────────────────────────────────────────
export const verifyTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference, courseId, bookId } = req.body;
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

    // ─── COURSE PURCHASE ──────────────────────────────────────────────────
    if (type === 'course_purchase' && courseIdFromMeta) {
      const course = await Course.findById(courseIdFromMeta);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      const price = course.salePrice || course.price || 0;

      // Enroll user
      const existingEnrollment = await Enrollment.findOne({ userId: user._id, courseId: course._id });
      if (!existingEnrollment) {
        await Enrollment.create({ userId: user._id, courseId: course._id });
        course.totalStudents += 1;
        await course.save();
      }

      // 1. Instructor earnings (80%)
      if (course.instructorId) {
        const instructor = await User.findById(course.instructorId);
        if (instructor) {
          const instructorShare = price * 0.8;
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
        }
      }

      // 2. Affiliate commission (if affiliate code used)
      const affiliateCode = meta.affiliateCode;
      if (affiliateCode) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const percent = course.affiliatePercent || 15;
          const commission = price * (percent / 100);
          affiliateLink.conversions += 1;
          affiliateLink.totalEarned = (affiliateLink.totalEarned || 0) + commission;
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
              reference,
              metadata: { courseId: course._id },
            });
          }
        }
      }

      // 3. Referral bonus (if referral code and no affiliate)
      const referralCode = meta.referralCode;
      if (referralCode && !affiliateCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const bonus = price * 0.1; // 10% of course price
          referrer.walletBalance = (referrer.walletBalance || 0) + bonus;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: bonus,
            status: 'completed',
            description: `Referral commission for course: ${course.title}`,
            reference,
            metadata: { courseId: course._id },
          });
        }
      }

      // Record user purchase transaction
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

    // ─── SUBSCRIPTION ──────────────────────────────────────────────────────
    else if (type === 'subscription') {
      // Activate premium
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await Transaction.create({
        userId: user._id,
        type: 'subscription',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: 'Premium subscription',
      });

      // Referral bonus (₦500)
      const referralCode = meta.referralCode;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          referrer.walletBalance = (referrer.walletBalance || 0) + 500;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: 500,
            status: 'completed',
            description: `Referral bonus for new subscriber: ${user.email}`,
            reference,
          });
          // Update referral record if exists
          await Referral.findOneAndUpdate(
            { referredId: user._id, status: 'pending' },
            { status: 'converted', earned: 500 }
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

      // Create purchase record (using Transaction)
      await Transaction.create({
        userId: user._id,
        type: 'book_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Purchase of book: ${book.title}`,
        metadata: { bookId: book._id },
      });

      // Increment downloads (optional – also on download)
      book.downloads = (book.downloads || 0) + 1;
      await book.save();
    }

    res.json({ success: true, message: 'Payment verified' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

// ──────────────────────────────────────────────────────────────────────
// 3. SUBSCRIBE TO PREMIUM
// ──────────────────────────────────────────────────────────────────────
export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });
    const { plan = 'premium', referralCode } = req.body;
    const amount = Number(process.env.SUBSCRIPTION_PRICE) || 5000;
    let finalReferralCode = referralCode;
    if (!finalReferralCode && user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) finalReferralCode = referrer.referralCode;
    }
    const metadata = { userId: user._id, type: 'subscription', plan, referralCode: finalReferralCode };
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      { email: user.email, amount: amount * 100, currency: 'NGN', metadata },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    res.json({ success: true, data: { paymentUrl: response.data.data.authorization_url, reference: response.data.data.reference } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ──────────────────────────────────────────────────────────────────────
// 4. GET USER TRANSACTIONS
// ──────────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────
// 5. REQUEST WITHDRAWAL
// ──────────────────────────────────────────────────────────────────────
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { amount } = req.body;
    if (amount < 2000) return res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
    if (amount > user.walletBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    user.walletBalance -= amount;
    user.pendingWithdrawal += amount;
    await user.save();
    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amount: -amount,
      status: 'pending',
      description: 'Withdrawal request',
    });
    res.json({ success: true, message: 'Withdrawal request submitted' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 6. GET SAVED PAYMENT METHODS
// ──────────────────────────────────────────────────────────────────────
export const getPaymentMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const bankAccounts = user.bankAccount ? [user.bankAccount] : [];
    res.json({ success: true, data: { bankAccounts } });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 7. MANUAL PAYMENT SUBMISSION – ALL TYPES (course, subscription, book)
// ──────────────────────────────────────────────────────────────────────
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { type, courseId, bookId, amount, reference, paymentDate } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Receipt file is required' });
    if (!reference || !amount || !paymentDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const allowedTypes = ['course', 'subscription', 'book'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment type. Allowed: course, subscription, book' });
    }

    let expectedAmount = 0;
    let courseTitle = '';
    let bookTitle = '';
    let metadata: any = {};

    if (type === 'subscription') {
      expectedAmount = Number(process.env.SUBSCRIPTION_PRICE) || 5000;
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      expectedAmount = course.salePrice || course.price || 0;
      courseTitle = course.title;
      metadata.courseId = courseId;
    } else if (type === 'book' && bookId) {
      const book = await Book.findById(bookId);
      if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
      expectedAmount = book.price || 0;
      bookTitle = book.title;
      metadata.bookId = bookId;
    }

    if (expectedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    let receiptUrl;
    try {
      const uploadResult = await uploadToCloudinary(file.buffer, 'manual_payments');
      receiptUrl = uploadResult.secure_url;
    } catch (uploadError) {
      return res.status(500).json({ success: false, message: 'Failed to upload receipt' });
    }

    // Validate but never auto‑approve – always send to admin review
    const existingReferences = await ManualPayment.find({ reference }).distinct('reference');
    const validation = await validateManualPayment(
      reference,
      Number(amount),
      new Date(paymentDate),
      expectedAmount,
      existingReferences as string[]
    );

    // Always create as pending_review
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

    // Notify user
    await Notification.create({
      userId: user._id,
      title: '⏳ Payment Submitted for Review',
      message: `Your manual payment of ₦${amount.toLocaleString()} for ${type === 'course' ? courseTitle : type === 'book' ? bookTitle : 'subscription'} has been submitted. An admin will review it shortly. You will be notified once approved.`,
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
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 8. GET SINGLE MANUAL PAYMENT STATUS
// ──────────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────
// 9. GET ALL MANUAL PAYMENTS FOR CURRENT USER
// ──────────────────────────────────────────────────────────────────────
export const getUserManualPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const payments = await ManualPayment.find({ userId: user._id }).sort('-createdAt');
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 10. PURCHASE BOOK (Paystack) – moved from book.controller
// ──────────────────────────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────
// 11. CANCEL SUBSCRIPTION
// ──────────────────────────────────────────────────────────────────────
export const cancelSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    user.isPremium = false;
    user.subscriptionExpires = undefined;
    await user.save();
    res.json({ success: true, message: 'Subscription cancelled successfully.' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 12. CLAIM WELCOME BONUS
// ──────────────────────────────────────────────────────────────────────
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
  } catch (err) {
    next(err);
  }
};
