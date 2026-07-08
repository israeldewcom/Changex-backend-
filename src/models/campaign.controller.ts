// ============================================================
// FILE: src/controllers/campaign.controller.ts (FULL UPDATED)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Campaign from '../models/Campaign.js';
import CampaignAnalytics from '../models/CampaignAnalytics.js';
import Transaction from '../models/Transaction.js';
import User, { IUser } from '../models/User.js';
import { uploadToCloudinary } from '../services/cloudinary.js';
import { getIO } from '../socket.js';
import axios from 'axios';
import { paystackConfig } from '../config/paystack.js';

// ─── Helper: Initialize Paystack Transaction ─────────────────────────
async function initializePaystackTransaction(email: string, amount: number, metadata: any) {
  const response = await axios.post(
    `${paystackConfig.baseUrl}/transaction/initialize`,
    {
      email,
      amount: amount * 100, // kobo
      currency: 'NGN',
      metadata,
      callback_url: `${process.env.FRONTEND_URL}/payment-callback`,
    },
    {
      headers: {
        Authorization: `Bearer ${paystackConfig.secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.data;
}

// ─── USER SUBMITS CAMPAIGN ─────────────────────────────────────────────
export const submitCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const {
      title,
      description,
      linkUrl,
      placement,
      budget,
      targetImpressions,
      targetClicks,
      startDate,
      endDate,
      cpc,
      cpm,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'campaigns', {
      transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    });

    const campaign = await Campaign.create({
      userId: user._id,
      title,
      description,
      imageUrl: result.secure_url,
      linkUrl,
      placement: placement || 'in-feed',
      budget: Number(budget),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      targetImpressions: Number(targetImpressions) || 0,
      targetClicks: Number(targetClicks) || 0,
      cpc: Number(cpc) || 0.02,
      cpm: Number(cpm) || 1.0,
      status: 'pending',
      isActive: false,
      escrowBalance: 0,
      totalDeducted: 0,
    });

    const admins = await User.find({ roles: 'admin' }).select('_id');
    for (const admin of admins) {
      getIO().to(`user:${admin._id}`).emit('campaign_pending', {
        campaignId: campaign._id,
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        title: campaign.title,
      });
    }

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

// ─── GET USER'S CAMPAIGNS ─────────────────────────────────────────────
export const getMyCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const campaigns = await Campaign.find({ userId: user._id }).sort('-createdAt');
    res.json({ success: true, data: campaigns });
  } catch (error) {
    next(error);
  }
};

// ─── GET CAMPAIGN STATS ──────────────────────────────────────────────
export const getCampaignStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const campaign = await Campaign.findOne({ _id: id, userId: user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const analytics = await CampaignAnalytics.find({ campaignId: campaign._id })
      .sort('date')
      .limit(30);

    const summary = {
      totalImpressions: campaign.impressions || 0,
      totalClicks: campaign.clicks || 0,
      totalViews: campaign.views || 0,
      totalUniqueViews: campaign.uniqueViews || 0,
      totalUniqueImpressions: campaign.uniqueImpressions || 0,
      totalConversions: campaign.conversions || 0,
      spent: campaign.totalDeducted || 0,
      budget: campaign.budget || 0,
      escrowBalance: campaign.escrowBalance || 0,
      cpc: campaign.cpc || 0.02,
      cpm: campaign.cpm || 1.0,
      ctr: campaign.impressions ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : 0,
      fraudScore: campaign.fraudScore || 0,
      invalidImpressions: campaign.invalidImpressions || 0,
      invalidClicks: campaign.invalidClicks || 0,
      status: campaign.status,
    };

    res.json({
      success: true,
      data: {
        campaign,
        summary,
        dailyAnalytics: analytics,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── TOGGLE CAMPAIGN (PAUSE/RESUME) ────────────────────────────────
export const toggleCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { pause } = req.body;

    const campaign = await Campaign.findOne({ _id: id, userId: user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'active' && campaign.status !== 'paused') {
      return res.status(400).json({ success: false, message: 'Campaign cannot be toggled' });
    }

    campaign.status = pause ? 'paused' : 'active';
    campaign.isActive = !pause;
    await campaign.save();

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE CAMPAIGN ──────────────────────────────────────────────────
export const deleteCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const campaign = await Campaign.findOne({ _id: id, userId: user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status === 'active') {
      return res.status(400).json({ success: false, message: 'Cannot delete active campaign. Pause it first.' });
    }

    await campaign.deleteOne();
    await CampaignAnalytics.deleteMany({ campaignId: id });

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    next(error);
  }
};

// ─── INITIALIZE CAMPAIGN PAYMENT ─────────────────────────────────────
export const initializeCampaignPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { campaignId } = req.body;

    const campaign = await Campaign.findOne({ _id: campaignId, userId: user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Campaign must be approved before payment' });
    }

    if (campaign.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Campaign already paid' });
    }

    const amount = campaign.budget;
    const metadata = {
      campaignId: campaign._id,
      userId: user._id,
      type: 'campaign_payment',
    };

    const paymentIntent = await initializePaystackTransaction(user.email, amount, metadata);

    campaign.paymentReference = paymentIntent.reference;
    await campaign.save();

    res.json({
      success: true,
      data: {
        paymentUrl: paymentIntent.authorization_url,
        reference: paymentIntent.reference,
        amount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── TOP UP CAMPAIGN BUDGET ──────────────────────────────────────────
export const topUpCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { amount } = req.body;

    const campaign = await Campaign.findOne({ _id: id, userId: user._id });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'active' && campaign.status !== 'paused') {
      return res.status(400).json({ success: false, message: 'Campaign cannot be topped up' });
    }

    // Initialize payment for the additional amount
    const metadata = {
      campaignId: campaign._id,
      userId: user._id,
      type: 'campaign_topup',
    };

    const paymentIntent = await initializePaystackTransaction(user.email, amount, metadata);

    // Store the top-up reference in campaign metadata (we'll handle in webhook)
    campaign.paymentReference = paymentIntent.reference;
    await campaign.save();

    res.json({
      success: true,
      data: {
        paymentUrl: paymentIntent.authorization_url,
        reference: paymentIntent.reference,
        amount,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: GET ALL CAMPAIGNS ────────────────────────────────────────
export const adminGetCampaigns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter: any = {};
    if (status && status !== 'all') filter.status = status;

    const campaigns = await Campaign.find(filter)
      .populate('userId', 'firstName lastName email')
      .sort('-createdAt')
      .limit(Number(limit));

    const stats = {
      total: await Campaign.countDocuments(),
      pending: await Campaign.countDocuments({ status: 'pending' }),
      approved: await Campaign.countDocuments({ status: 'approved' }),
      active: await Campaign.countDocuments({ status: 'active' }),
      completed: await Campaign.countDocuments({ status: 'completed' }),
      rejected: await Campaign.countDocuments({ status: 'rejected' }),
      totalBudget: await Campaign.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$budget' } } },
      ]),
    };

    res.json({ success: true, data: { campaigns, stats } });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: APPROVE CAMPAIGN ──────────────────────────────────────────
export const approveCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const admin = req.user as IUser;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Campaign is already ${campaign.status}` });
    }

    campaign.status = 'approved';
    campaign.adminApprovedBy = admin._id;
    campaign.adminApprovedAt = new Date();
    await campaign.save();

    getIO().to(`user:${campaign.userId}`).emit('campaign_approved', {
      campaignId: campaign._id,
      title: campaign.title,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: REJECT CAMPAIGN ───────────────────────────────────────────
export const rejectCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Campaign is already ${campaign.status}` });
    }

    campaign.status = 'rejected';
    campaign.rejectionReason = reason || 'Not specified';
    campaign.isActive = false;
    await campaign.save();

    getIO().to(`user:${campaign.userId}`).emit('campaign_rejected', {
      campaignId: campaign._id,
      title: campaign.title,
      reason: campaign.rejectionReason,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: REFUND CAMPAIGN ───────────────────────────────────────────
export const refundCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const admin = req.user as IUser;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.escrowBalance <= 0) {
      return res.status(400).json({ success: false, message: 'No balance to refund' });
    }

    // Credit user's wallet
    const user = await User.findById(campaign.userId);
    if (user) {
      user.walletBalance += campaign.escrowBalance;
      await user.save();
      await Transaction.create({
        userId: user._id,
        type: 'refund',
        amount: campaign.escrowBalance,
        status: 'completed',
        description: `Campaign refund: ${campaign.title}`,
        metadata: { campaignId: campaign._id, adminId: admin._id },
      });
    }

    campaign.paymentStatus = 'refunded';
    campaign.escrowBalance = 0;
    campaign.status = 'completed';
    await campaign.save();

    getIO().to(`user:${campaign.userId}`).emit('campaign_refunded', {
      campaignId: campaign._id,
      title: campaign.title,
      amount: campaign.escrowBalance,
    });

    res.json({ success: true, message: 'Refund processed successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: GET CAMPAIGN DETAILS ──────────────────────────────────────
export const adminGetCampaign = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id).populate('userId', 'firstName lastName email phone');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const analytics = await CampaignAnalytics.find({ campaignId: campaign._id })
      .sort('date')
      .limit(30);

    res.json({ success: true, data: { campaign, analytics } });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN: MARK MANUAL PAYMENT VERIFIED ─────────────────────────────
export const verifyManualPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const admin = req.user as IUser;
    const { reference, receiptUrl } = req.body;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    if (campaign.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Campaign must be approved before payment' });
    }

    if (campaign.manualPaymentVerified) {
      return res.status(400).json({ success: false, message: 'Payment already verified' });
    }

    campaign.manualPaymentVerified = true;
    campaign.manualPaymentReference = reference || '';
    campaign.manualPaymentReceipt = receiptUrl || '';
    campaign.paymentStatus = 'paid';
    campaign.escrowBalance = campaign.budget;
    campaign.status = 'active';
    campaign.isActive = true;
    await campaign.save();

    await Transaction.create({
      userId: campaign.userId,
      type: 'campaign_payment',
      amount: campaign.budget,
      status: 'completed',
      description: `Manual campaign payment: ${campaign.title}`,
      metadata: { campaignId: campaign._id, adminId: admin._id },
    });

    getIO().to(`user:${campaign.userId}`).emit('campaign_active', {
      campaignId: campaign._id,
      title: campaign.title,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};
