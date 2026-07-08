// ============================================================
// FILE: src/controllers/sponsorship.controller.ts (FULL)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Sponsorship from '../models/Sponsorship.js';
import Transaction from '../models/Transaction.js';
import User, { IUser } from '../models/User.js';
import { getIO } from '../socket.js';

// ─── SUBMIT SPONSORSHIP ──────────────────────────────────────────────
export const submitSponsorship = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { type, amount, message, companyName, website, phone, receiptUrl, reference } = req.body;

    if (!type || !amount || !message) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const sponsorship = await Sponsorship.create({
      userId: user._id,
      type,
      amount: Number(amount),
      message,
      companyName: companyName || '',
      website: website || '',
      email: user.email,
      phone: phone || '',
      receiptUrl: receiptUrl || '',
      reference: reference || '',
      status: 'pending',
    });

    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('sponsorship_pending', {
        sponsorshipId: sponsorship._id,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        type: sponsorship.type,
        amount: sponsorship.amount,
      });
    }

    res.status(201).json({ success: true, data: sponsorship });
  } catch (error) {
    next(error);
  }
};

// ─── GET MY SPONSORSHIPS ─────────────────────────────────────────────
export const getMySponsorships = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const sponsorships = await Sponsorship.find({ userId: user._id }).sort('-createdAt');
    res.json({ success: true, data: sponsorships });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: GET ALL SPONSORSHIPS ─────────────────────────────────────
export const adminGetSponsorships = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;

    const sponsorships = await Sponsorship.find(filter)
      .populate('userId', 'firstName lastName email phone')
      .sort('-createdAt')
      .limit(Number(limit));

    const stats = {
      total: await Sponsorship.countDocuments(),
      pending: await Sponsorship.countDocuments({ status: 'pending' }),
      approved: await Sponsorship.countDocuments({ status: 'approved' }),
      rejected: await Sponsorship.countDocuments({ status: 'rejected' }),
      completed: await Sponsorship.countDocuments({ status: 'completed' }),
      totalAmount: await Sponsorship.aggregate([
        { $match: { status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    };

    res.json({ success: true, data: { sponsorships, stats } });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: APPROVE SPONSORSHIP ──────────────────────────────────────
export const approveSponsorship = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const admin = req.user as IUser;

    const sponsorship = await Sponsorship.findById(id);
    if (!sponsorship) {
      return res.status(404).json({ success: false, message: 'Sponsorship not found' });
    }

    if (sponsorship.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Already ${sponsorship.status}` });
    }

    sponsorship.status = 'approved';
    sponsorship.adminNote = req.body.adminNote || '';
    await sponsorship.save();

    if (sponsorship.type === 'donation' && sponsorship.amount > 0) {
      const user = await User.findById(sponsorship.userId);
      if (user) {
        const reward = sponsorship.amount * 0.1;
        user.walletBalance = (user.walletBalance || 0) + reward;
        await user.save();
        await Transaction.create({
          userId: user._id,
          type: 'bonus',
          amount: reward,
          status: 'completed',
          description: `Sponsorship reward for ${sponsorship.type}`,
          metadata: { sponsorshipId: sponsorship._id },
        });
      }
    }

    getIO().to(`user:${sponsorship.userId}`).emit('sponsorship_approved', {
      sponsorshipId: sponsorship._id,
      type: sponsorship.type,
    });

    res.json({ success: true, data: sponsorship });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: REJECT SPONSORSHIP ───────────────────────────────────────
export const rejectSponsorship = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const sponsorship = await Sponsorship.findById(id);
    if (!sponsorship) {
      return res.status(404).json({ success: false, message: 'Sponsorship not found' });
    }

    sponsorship.status = 'rejected';
    sponsorship.adminNote = reason || 'Not specified';
    await sponsorship.save();

    getIO().to(`user:${sponsorship.userId}`).emit('sponsorship_rejected', {
      sponsorshipId: sponsorship._id,
      reason: sponsorship.adminNote,
    });

    res.json({ success: true, data: sponsorship });
  } catch (error) {
    next(error);
  }
};
