// ============================================
// FILE: src/controllers/PaymentController.ts (unchanged)
// ============================================
import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { Transaction } from '../models/Transaction';

export class PaymentController {
  private paymentService: PaymentService;
  constructor() { this.paymentService = PaymentService.getInstance(); }

  initiateWithdrawal = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }
    try {
      const userId = (req as any).user?.userId;
      const { amount, bankName, accountNumber, accountName, bankCode } = req.body;
      const transaction = await this.paymentService.processWithdrawal(userId, amount, { bankName, accountNumber, accountName, bankCode });
      res.json({ success: true, data: transaction, message: 'Withdrawal request submitted successfully' });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  };

  getTransactionHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20, type, status } = req.query;
      const query: any = { user: userId };
      if (type) query.type = type;
      if (status) query.status = status;
      const skip = (Number(page) - 1) * Number(limit);
      const [transactions, total] = await Promise.all([Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), Transaction.countDocuments(query)]);
      res.json({ success: true, data: { transactions, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getWithdrawalHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      const [withdrawals, total] = await Promise.all([Transaction.find({ user: userId, type: 'withdrawal' }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), Transaction.countDocuments({ user: userId, type: 'withdrawal' })]);
      res.json({ success: true, data: { withdrawals, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getEarningsSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const [totalEarnings, monthlyEarnings, byType] = await Promise.all([
        Transaction.aggregate([{ $match: { user: new (require('mongoose').Types.ObjectId)(userId), type: 'commission', status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.aggregate([{ $match: { user: new (require('mongoose').Types.ObjectId)(userId), type: 'commission', status: 'completed', createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Transaction.aggregate([{ $match: { user: new (require('mongoose').Types.ObjectId)(userId), type: 'commission', status: 'completed' } }, { $group: { _id: '$subtype', total: { $sum: '$amount' } } }]),
      ]);
      res.json({ success: true, data: { totalEarned: totalEarnings[0]?.total || 0, monthlyEarned: monthlyEarnings[0]?.total || 0, byType: byType.reduce((acc, curr) => { acc[curr._id] = curr.total; return acc; }, {}) } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };

  getPaymentMethods = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).select('stripeCustomerId paystackCustomerCode');
      res.json({ success: true, data: { hasStripe: !!user?.stripeCustomerId, hasPaystack: !!user?.paystackCustomerCode, availableMethods: ['wallet', 'stripe', 'paystack'] } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  };
}
