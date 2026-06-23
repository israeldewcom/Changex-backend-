import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import ManualPayment from '../models/ManualPayment.js';
import Book from '../models/Book.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { validateManualPayment } from '../services/manualPaymentValidator.js';
import { getIO } from '../socket.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

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
    let course = null;
    let price = 0;
    let referralCode = meta.referralCode || null;
    let affiliateCode = meta.affiliateCode || null;

    if (type === 'course_purchase' && courseId) {
      course = await Course.findById(courseId);
      if (course) {
        price = course.salePrice || course.price || 0;
      }
      const existing = await Enrollment.findOne({ userId: user._id, courseId });
      if (!existing) {
        await Enrollment.create({ userId: user._id, courseId });
        await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
      }

      // Instructor earning (80%)
      if (course && course.instructorId) {
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
            reference: `PAYSTACK_${reference}`,
          });
        }
      }

      // Affiliate commission (if any)
      if (affiliateCode && course) {
        const affiliateLink = await (await import('../models/AffiliateLink.js')).default.findOne({ code: affiliateCode });
        if (affiliateLink) {
          const percent = course.affiliatePercent || 15;
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
              reference: `PAYSTACK_${reference}`,
            });
          }
        }
      }

      // Referral bonus (10% for the referrer, only if no affiliate)
      if (referralCode && !affiliateCode && course) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const referrerShare = price * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + referrerShare;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: referrerShare,
            status: 'completed',
            description: `Referral commission for course: ${course.title}`,
            reference: `PAYSTACK_${reference}`,
          });
        }
      }

      // Update user's wallet balance for the purchase (if premium subscription)
      // Course purchase is not added to wallet, it's deducted
    }

    if (type === 'subscription') {
      const subscriptionAmount = 5000;
      // Check if referral code was used for discount
      if (referralCode) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          // Apply 10% discount
          const discount = subscriptionAmount * 0.1;
          const finalAmount = subscriptionAmount - discount;
          // Actually we already charged full amount, but we credit the referrer
          // and we could refund discount to user (or just credit referrer)
          referrer.walletBalance = (referrer.walletBalance || 0) + 500; // ₦500 referral bonus
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_bonus',
            amount: 500,
            status: 'completed',
            description: `Referral bonus for premium subscription`,
            reference: `PAYSTACK_${reference}`,
          });
          // Mark referral as converted
          const Referral = (await import('../models/Referral.js')).default;
          const referral = await Referral.findOne({ referredId: user._id, status: 'pending' });
          if (referral) {
            referral.status = 'converted';
            referral.earned = 500;
            await referral.save();
          }
        }
      }
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
        description: `Premium subscription`,
      });
    }

    if (type === 'book_purchase' && bookId) {
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({ success: false, message: 'Book not found' });
      }
      await Transaction.create({
        userId: user._id,
        type: 'book_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Book purchase: ${book.title}`,
        metadata: { bookId: book._id },
      });
    }

    await Transaction.create({
      userId: user._id,
      type,
      amount: data.amount / 100,
      status: 'completed',
      reference,
      description: `Paystack ${type}`,
    });

    res.json({ success: true, message: 'Payment verified' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.response?.data?.message || err.message });
  }
};

export const subscribe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });
    const { plan = 'premium', referralCode } = req.body;
    const amount = 5000;
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

export const getPaymentMethods = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const bankAccounts = user.bankAccount ? [user.bankAccount] : [];
    res.json({ success: true, data: { bankAccounts } });
  } catch (err) {
    next(err);
  }
};

export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { type, courseId, amount, reference, paymentDate, referralCode } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Receipt file is required' });
    if (!reference || !amount || !paymentDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!['course', 'subscription', 'book'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment type' });
    }
    if (type === 'course' && !courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

    let expectedAmount = 0;
    let courseTitle = '';
    let bookTitle = '';
    if (type === 'subscription') {
      expectedAmount = 5000;
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      expectedAmount = course.salePrice || course.price || 0;
      courseTitle = course.title;
    } else if (type === 'book') {
      const book = await Book.findById(courseId);
      if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
      expectedAmount = book.price || 0;
      bookTitle = book.title;
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

    // Validate but do NOT auto‑approve – always send to admin review
    const existingReferences = await ManualPayment.find({ reference }).distinct('reference');
    const validation = await validateManualPayment(
      reference,
      Number(amount),
      new Date(paymentDate),
      expectedAmount,
      existingReferences as string[]
    );

    const manualPayment = await ManualPayment.create({
      userId: user._id,
      type: type === 'book' ? 'course' : type, // books use the same flow as courses
      courseId: type === 'course' || type === 'book' ? courseId : undefined,
      amount: Number(amount),
      reference: reference.toUpperCase(),
      paymentDate: new Date(paymentDate),
      receiptUrl,
      status: 'pending_review',
      autoDetected: false,
      adminNote: validation.isValid ? 'Valid format, pending admin review' : 'Format validation failed – admin review required',
      metadata: { referralCode: referralCode || null },
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
      message: `Your manual payment of ₦${amount.toLocaleString()} has been submitted. An admin will review it shortly. You will be notified once approved.`,
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

export const purchaseBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { bookId, referralCode } = req.body;
    if (!bookId) return res.status(400).json({ success: false, message: 'Book ID required' });

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    const metadata = {
      type: 'book_purchase',
      bookId: book._id,
      userId: user._id,
      referralCode: referralCode || (user.referredBy ? (await User.findById(user.referredBy))?.referralCode : null),
    };
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
