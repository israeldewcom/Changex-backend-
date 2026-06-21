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

// ──────────────────────────────────────────────────────────────────────
// 1. INITIALIZE PAYSTACK TRANSACTION (Course, Subscription, Book)
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
// 2. VERIFY PAYSTACK TRANSACTION (Supports course, subscription, book)
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

    // ─── Course Purchase ────────────────────────────────────────────
    if (type === 'course_purchase' && courseId) {
      const existing = await Enrollment.findOne({ userId: user._id, courseId });
      if (!existing) {
        await Enrollment.create({ userId: user._id, courseId });
        await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
      }
    }

    // ─── Subscription ──────────────────────────────────────────────
    else if (type === 'subscription') {
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    // ─── Book Purchase ─────────────────────────────────────────────
    else if (type === 'book_purchase' && bookId) {
      const book = await Book.findById(bookId);
      if (!book) {
        return res.status(404).json({ success: false, message: 'Book not found' });
      }
      // Record purchase transaction
      await Transaction.create({
        userId: user._id,
        type: 'book_purchase',
        amount: data.amount / 100,
        status: 'completed',
        reference,
        description: `Book purchase: ${book.title}`,
        metadata: { bookId: book._id }
      });
    }

    // ─── Record the main transaction ──────────────────────────────
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

// ──────────────────────────────────────────────────────────────────────
// 3. SUBSCRIBE TO PREMIUM (uses Paystack)
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
// 6. GET SAVED PAYMENT METHODS (Bank Accounts)
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
// 7. MANUAL PAYMENT SUBMISSION (Bank Transfer)
// ──────────────────────────────────────────────────────────────────────
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'User not authenticated' });

    const { type, courseId, amount, reference, paymentDate } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Receipt file is required' });
    if (!reference || !amount || !paymentDate) return res.status(400).json({ success: false, message: 'Missing required fields' });
    if (!['course', 'subscription'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid payment type' });
    if (type === 'course' && !courseId) return res.status(400).json({ success: false, message: 'Course ID is required' });

    let expectedAmount = 0;
    let courseTitle = '';
    if (type === 'subscription') {
      expectedAmount = 5000;
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
      expectedAmount = course.salePrice || course.price || 0;
      courseTitle = course.title;
    }
    if (expectedAmount <= 0) return res.status(400).json({ success: false, message: 'Invalid payment amount' });

    let receiptUrl;
    try {
      const uploadResult = await uploadToCloudinary(file.buffer, 'manual_payments');
      receiptUrl = uploadResult.secure_url;
    } catch (uploadError) {
      return res.status(500).json({ success: false, message: 'Failed to upload receipt' });
    }

    // Validate against existing references
    const existingReferences = await ManualPayment.find({ reference }).distinct('reference');
    const validation = await validateManualPayment(reference, Number(amount), new Date(paymentDate), expectedAmount, existingReferences as string[]);

    const manualPayment = await ManualPayment.create({
      userId: user._id,
      type,
      courseId: type === 'course' ? courseId : undefined,
      amount: Number(amount),
      reference: reference.toUpperCase(),
      paymentDate: new Date(paymentDate),
      receiptUrl,
      status: validation.autoApprove ? 'approved' : 'pending_review',
      autoDetected: validation.autoApprove,
    });

    if (validation.autoApprove) {
      // Auto‑approve: grant access immediately
      if (type === 'subscription') {
        await User.findByIdAndUpdate(user._id, {
          isPremium: true,
          subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        await Transaction.create({
          userId: user._id,
          type: 'subscription',
          amount: Number(amount),
          status: 'completed',
          description: `Manual payment (auto-approved) - ${reference}`,
          reference: `MANUAL_${reference}`,
        });
      } else if (type === 'course' && courseId) {
        const existingEnrollment = await Enrollment.findOne({ userId: user._id, courseId });
        if (!existingEnrollment) {
          await Enrollment.create({ userId: user._id, courseId });
          await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
          const course = await Course.findById(courseId);
          if (course && course.instructorId) {
            const instructorShare = expectedAmount * 0.8;
            const instructor = await User.findById(course.instructorId);
            if (instructor) {
              instructor.walletBalance = (instructor.walletBalance || 0) + instructorShare;
              await instructor.save();
              await Transaction.create({
                userId: instructor._id,
                type: 'instructor_earning',
                amount: instructorShare,
                status: 'completed',
                description: `Course sale (manual): ${course.title}`,
              });
            }
          }
        }
        await Transaction.create({
          userId: user._id,
          type: 'course_purchase',
          amount: Number(amount),
          status: 'completed',
          description: `Manual payment for course - ${reference}`,
          reference: `MANUAL_${reference}`,
        });
      }

      await Notification.create({
        userId: user._id,
        title: '✅ Payment Verified Automatically',
        message: `Your payment of ₦${amount.toLocaleString()} for ${type === 'subscription' ? 'Premium subscription' : courseTitle} has been automatically verified and approved.`,
        type: 'payment',
      });
      getIO().to(`user:${user._id}`).emit('notification', {
        title: 'Payment Approved',
        message: 'Your manual payment has been verified!',
      });
      return res.json({
        success: true,
        message: 'Payment verified automatically! Access granted.',
        autoApproved: true,
        data: manualPayment,
      });
    }

    // Notify admins for manual review
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
        reason: validation.reason || 'Needs manual review',
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
      message: `Your manual payment of ₦${amount.toLocaleString()} has been submitted. An admin will review it shortly.`,
      type: 'payment',
    });

    res.json({
      success: true,
      message: validation.reason
        ? `Payment submitted for admin review. Reason: ${validation.reason}`
        : 'Payment submitted for admin review. You will be notified once approved.',
      autoApproved: false,
      data: manualPayment,
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────────
// 8. GET SINGLE MANUAL PAYMENT STATUS (for user)
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
// 10. PURCHASE BOOK (NEW)
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
