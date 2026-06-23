// ============================================================
// FILE: src/controllers/payment.controller.ts (COMPLETE - FULLY UPDATED)
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
import Referral from '../models/Referral.js';
import AffiliateLink from '../models/AffiliateLink.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { validateManualPayment } from '../services/manualPaymentValidator.js';
import { getIO } from '../socket.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// ──────────────────────────────────────────────────────────────────────
// 1. INITIALIZE PAYSTACK TRANSACTION (Course, Subscription, Book)
// ──────────────────────────────────────────────────────────────────────
export const initializeTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });
    const { email, amount, currency = 'NGN', metadata } = req.body;
    let finalMetadata = metadata || {};
    
    // Add referral code if available
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
// 2. VERIFY PAYSTACK TRANSACTION (with Referral & Affiliate handling)
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
    const referralCode = meta.referralCode ? String(meta.referralCode).trim().toUpperCase() : null;
    const affiliateCode = meta.affiliateCode ? String(meta.affiliateCode).trim() : null;
    const course = courseId ? await Course.findById(courseId) : null;
    let coursePrice = 0;

    // ─── Course Purchase ──────────────────────────────────────────────
    if (type === 'course_purchase' && courseId) {
      const existing = await Enrollment.findOne({ userId: user._id, courseId });
      if (!existing) {
        await Enrollment.create({ userId: user._id, courseId });
        await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
        
        // Get course for revenue share
        const courseData = await Course.findById(courseId);
        if (courseData) {
          coursePrice = courseData.salePrice || courseData.price || 0;
          
          // Instructor gets 80%
          if (courseData.instructorId) {
            const instructorShare = coursePrice * 0.8;
            const instructor = await User.findById(courseData.instructorId);
            if (instructor) {
              instructor.walletBalance = (instructor.walletBalance || 0) + instructorShare;
              await instructor.save();
              await Transaction.create({
                userId: instructor._id,
                type: 'instructor_earning',
                amount: instructorShare,
                status: 'completed',
                description: `Course sale: ${courseData.title}`,
                metadata: { courseId: courseData._id, studentId: user._id }
              });
            }
          }
        }
      }

      // ─── Affiliate Commission ──────────────────────────────────────
      if (affiliateCode && course) {
        const affiliateLink = await AffiliateLink.findOne({ code: affiliateCode });
        if (affiliateLink && affiliateLink.courseId.toString() === courseId) {
          const price = course.salePrice || course.price || 0;
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
              description: `Affiliate commission for course: ${course.title}`,
              metadata: { courseId: course._id, studentId: user._id, affiliateCode }
            });
          }
        }
      }

      // ─── Referral Commission (only if no affiliate) ──────────────
      if (referralCode && !affiliateCode && course) {
        const referrer = await User.findOne({ referralCode: { $regex: `^${referralCode}$`, $options: 'i' } });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          const referrerShare = coursePrice * 0.1;
          referrer.walletBalance = (referrer.walletBalance || 0) + referrerShare;
          await referrer.save();
          await Transaction.create({
            userId: referrer._id,
            type: 'referral_commission',
            amount: referrerShare,
            status: 'completed',
            description: `Referral commission for course: ${course.title}`,
            metadata: { courseId: course._id, studentId: user._id }
          });
        }
      }
    }

    // ─── Subscription (Premium) ──────────────────────────────────────
    else if (type === 'subscription') {
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
            description: 'Referral bonus for premium subscription'
          });
        }
      }
      
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    // ─── Book Purchase ──────────────────────────────────────────────
    else if (type === 'book_purchase' && bookId) {
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

    // ─── Record the main transaction ──────────────────────────────────
    await Transaction.create({
      userId: user._id,
      type,
      amount: data.amount / 100,
      status: 'completed',
      reference,
      description: `Paystack ${type}`,
      metadata: { ...meta, referralCode, affiliateCode }
    });

    // ─── Update user wallet balance ──────────────────────────────────
    // (already updated above via instructor/affiliate/referrer updates)
    // Refresh user object to get updated balance
    const updatedUser = await User.findById(user._id);
    if (updatedUser) {
      // Emit wallet update via socket
      getIO().to(`user:${user._id}`).emit('wallet_updated', {
        balance: updatedUser.walletBalance,
        userId: user._id
      });
    }

    res.json({ success: true, message: 'Payment verified', data: { balance: updatedUser?.walletBalance || 0 } });
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
    const amount = 5000;
    let finalReferralCode = referralCode;
    if (!finalReferralCode && user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      if (referrer) finalReferralCode = referrer.referralCode;
    }
    const metadata = { 
      userId: user._id, 
      type: 'subscription', 
      plan, 
      referralCode: finalReferralCode,
      discountApplied: false
    };
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
// 7. MANUAL PAYMENT SUBMISSION – SUPPORTS 'course' AND 'subscription'
// ──────────────────────────────────────────────────────────────────────
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { type, courseId, amount, reference, paymentDate } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Receipt file is required' });
    if (!reference || !amount || !paymentDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!['course', 'subscription'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment type. Must be "course" or "subscription"' });
    }
    if (type === 'course' && !courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required for course purchase' });
    }

    let expectedAmount = 0;
    let courseTitle = '';
    let courseData = null;
    if (type === 'subscription') {
      expectedAmount = 5000;
    } else if (type === 'course' && courseId) {
      courseData = await Course.findById(courseId);
      if (!courseData) return res.status(404).json({ success: false, message: 'Course not found' });
      expectedAmount = courseData.salePrice || courseData.price || 0;
      courseTitle = courseData.title;
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

    // Always create as pending_review – no auto‑approval
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
    console.error('Manual payment submission error:', err);
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
// 10. PURCHASE BOOK
// ──────────────────────────────────────────────────────────────────────
export const purchaseBook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { bookId } = req.body;
    if (!bookId) return res.status(400).json({ success: false, message: 'Book ID required' });

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    if (book.price === 0) return res.status(400).json({ success: false, message: 'This book is free' });

    const metadata = { 
      type: 'book_purchase', 
      bookId: book._id, 
      userId: user._id,
      referralCode: user.referredBy ? (await User.findById(user.referredBy))?.referralCode : null
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
