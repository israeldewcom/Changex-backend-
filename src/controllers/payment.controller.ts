import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import ManualPayment from '../models/ManualPayment.js';
import { validateManualPayment } from '../services/manualPaymentValidator.js';
import { getIO } from '../socket.js';
import Notification from '../models/Notification.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

// Configure Cloudinary directly
console.log('🔧 [payment.controller] Configuring Cloudinary...');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log('✅ Cloudinary config applied. api_secret present?', !!cloudinary.config().api_secret);

async function uploadReceiptToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload success:', result?.secure_url);
          resolve(result!.secure_url);
        }
      }
    );
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

// -------------------- Existing Paystack controllers (unchanged) --------------------
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
    const { reference, courseId } = req.body;
    const user = req.user as IUser;
    if (!reference) return res.status(400).json({ success: false, message: 'Reference required' });

    const verification = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = verification.data.data;
    if (data.status !== 'success') return res.status(400).json({ success: false, message: 'Payment not successful' });

    const meta = data.metadata || {};
    const type = meta.type || 'course_purchase';

    if (type === 'course_purchase' && courseId) {
      const existing = await Enrollment.findOne({ userId: user._id, courseId });
      if (!existing) {
        await Enrollment.create({ userId: user._id, courseId });
        await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
      }
    } else if (type === 'subscription') {
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

// -------------------- MANUAL PAYMENT (Admin approval only, no auto-approve) --------------------
export const submitManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { type, courseId, amount, reference, paymentDate } = req.body;
    const file = req.file;

    // Validation
    if (!file) {
      return res.status(400).json({ success: false, message: 'Receipt file is required' });
    }
    if (!reference || !amount || !paymentDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields: reference, amount, paymentDate' });
    }
    if (!['course', 'subscription'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid payment type' });
    }
    if (type === 'course' && !courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required for course purchase' });
    }

    // Determine expected amount (only for reference, not for auto-approve)
    let expectedAmount = 0;
    if (type === 'subscription') {
      expectedAmount = 5000;
    } else if (type === 'course' && courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found' });
      }
      expectedAmount = course.salePrice || course.price || 0;
    }

    if (expectedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }

    // Upload receipt to Cloudinary
    let receiptUrl: string;
    try {
      receiptUrl = await uploadReceiptToCloudinary(file.buffer, 'manual_payments');
      console.log('Receipt uploaded:', receiptUrl);
    } catch (uploadError) {
      console.error('Receipt upload failed:', uploadError);
      return res.status(500).json({ success: false, message: 'Failed to upload receipt. Please try again.' });
    }

    // Check for duplicate reference (optional, but prevents double submission)
    const existingReference = await ManualPayment.findOne({ reference: reference.toUpperCase() });
    if (existingReference) {
      return res.status(400).json({ success: false, message: 'Duplicate reference number. This payment has already been submitted.' });
    }

    // Create manual payment record – ALWAYS pending_review
    const manualPayment = await ManualPayment.create({
      userId: user._id,
      type,
      courseId: type === 'course' ? courseId : undefined,
      amount: Number(amount),
      reference: reference.toUpperCase(),
      paymentDate: new Date(paymentDate),
      receiptUrl,
      status: 'pending_review',   // Force pending review – no auto-approve
      autoDetected: false,
    });

    // Notify all admins (real-time socket + database notification)
    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('admin_manual_payment_alert', {
        paymentId: manualPayment._id,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        amount: Number(amount),
        reference: reference.toUpperCase(),
        type,
        receiptUrl,
        createdAt: manualPayment.createdAt,
      });
      
      await Notification.create({
        userId: admin._id,
        title: '📋 Manual Payment Pending Review',
        message: `${user.firstName} ${user.lastName} submitted a manual payment of ₦${amount.toLocaleString()} for ${type}. Reference: ${reference.toUpperCase()}`,
        type: 'system',
        data: { paymentId: manualPayment._id, type: 'manual_payment_review' },
      });
    }

    // Notify user that payment is pending
    await Notification.create({
      userId: user._id,
      title: '⏳ Payment Submitted for Review',
      message: `Your manual payment of ₦${amount.toLocaleString()} has been submitted. An admin will review it shortly. You will be notified once approved.`,
      type: 'payment',
    });

    res.json({
      success: true,
      message: 'Payment submitted for admin review. You will be notified once approved.',
      autoApproved: false,
      data: manualPayment,
    });
  } catch (err) {
    console.error('Manual payment submission error:', err);
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
