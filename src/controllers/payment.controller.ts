// src/controllers/payment.controller.ts
import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const PAYSTACK_BASE = 'https://api.paystack.co';

export const initializeTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { email, amount, currency = 'NGN', metadata } = req.body;
    if (!email || !amount) {
      res.status(400).json({ success: false, message: 'Email and amount required' });
      return;
    }
    const response = await axios.post(
      `${PAYSTACK_BASE}/transaction/initialize`,
      { email, amount: amount * 100, currency, metadata },
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
    if (!reference) {
      res.status(400).json({ success: false, message: 'Reference required' });
      return;
    }
    const verification = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const data = verification.data.data;
    if (data.status !== 'success') {
      res.status(400).json({ success: false, message: 'Payment not successful' });
      return;
    }
    const meta = data.metadata || {};
    const type = meta.type || 'course_purchase';
    if (type === 'course_purchase' && courseId) {
      const existing = await Enrollment.findOne({ userId: user._id, courseId });
      if (!existing) {
        await Enrollment.create({ userId: user._id, courseId });
        await Course.findByIdAndUpdate(courseId, { $inc: { totalStudents: 1 } });
      }
    } else if (type === 'subscription') {
      await User.findByIdAndUpdate(user._id, { isPremium: true, subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
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
    const { plan = 'premium' } = req.body;
    const amount = 5000;
    const metadata = { userId: user._id, type: 'subscription', plan };
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
  } catch (err) { next(err); }
};

export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { amount, bankAccountId } = req.body;
    if (amount < 2000) {
      res.status(400).json({ success: false, message: 'Minimum withdrawal is ₦2,000' });
      return;
    }
    if (amount > user.walletBalance) {
      res.status(400).json({ success: false, message: 'Insufficient balance' });
      return;
    }
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
  } catch (err) { next(err); }
};
