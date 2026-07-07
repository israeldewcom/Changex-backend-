// ============================================================
// FILE: src/controllers/ad.controller.ts (UPDATED – validate placement)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Ad from '../models/Ad.js';
import Post from '../models/Post.js';
import User, { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import AdConfig from '../models/AdConfig.js';

const VALID_PLACEMENTS = [
  'sidebar',
  'banner',
  'in-feed',
  'popup',
  'book-page',
  'video-pre',
  'video-mid',
  'lesson-inline',
  'challenge-sponsor',
  'book-sponsor',
  'explore-sponsor'
];

export const getActiveAds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { placement } = req.params;
    if (!VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ success: false, message: 'Invalid placement' });
    }
    const now = new Date();
    const ads = await Ad.find({
      placement,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).limit(5);
    res.json({ success: true, data: ads });
  } catch (error) {
    next(error);
  }
};

export const trackAdImpression = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Ad.findByIdAndUpdate(id, { $inc: { impressions: 1 } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const trackAdClick = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Ad.findByIdAndUpdate(id, { $inc: { clicks: 1 } });
    const ad = await Ad.findById(id);
    res.json({ success: true, redirectUrl: ad?.linkUrl });
  } catch (error) {
    next(error);
  }
};

export const createAd = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as IUser;
    const { placement } = req.body;
    if (!VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ success: false, message: 'Invalid placement' });
    }
    const ad = await Ad.create({ ...req.body, createdBy: admin._id });
    res.status(201).json({ success: true, data: ad });
  } catch (error) {
    next(error);
  }
};

export const getAds = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ads = await Ad.find().sort('-createdAt').populate('createdBy', 'firstName lastName');
    res.json({ success: true, data: ads });
  } catch (error) {
    next(error);
  }
};

export const updateAd = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { placement } = req.body;
    if (placement && !VALID_PLACEMENTS.includes(placement)) {
      return res.status(400).json({ success: false, message: 'Invalid placement' });
    }
    const ad = await Ad.findByIdAndUpdate(id, req.body, { new: true });
    if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
    res.json({ success: true, data: ad });
  } catch (error) {
    next(error);
  }
};

export const deleteAd = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await Ad.findByIdAndDelete(id);
    res.json({ success: true, message: 'Ad deleted' });
  } catch (error) {
    next(error);
  }
};

export const trackAdEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { adId, type, postId, network } = req.body;
    const viewer = req.user as IUser | undefined;

    if (!adId || !type || !postId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const post = await Post.findById(postId).populate('authorId');
    if (!post || !post.authorId) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const author = post.authorId as unknown as IUser;
    const config = await AdConfig.getConfig();

    let revenue = 0;
    if (type === 'impression') {
      revenue = (config.cpm / 1000) * 1;
    } else if (type === 'click') {
      revenue = config.cpc * 1;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid event type' });
    }

    const creatorEarnings = revenue * (config.sharePercent / 100);

    if (creatorEarnings > 0) {
      await User.findByIdAndUpdate(author._id, {
        $inc: {
          walletBalance: creatorEarnings,
          adEarnings: creatorEarnings,
        },
      });

      await Transaction.create({
        userId: author._id,
        type: 'ad_revenue',
        amount: creatorEarnings,
        description: `50% revenue share from ${type} on post "${post.title}" (${network || 'custom'})`,
        status: 'completed',
        metadata: { postId, adId, eventType: type, network },
      });

      await Post.findByIdAndUpdate(postId, {
        $inc: {
          adImpressions: type === 'impression' ? 1 : 0,
          adClicks: type === 'click' ? 1 : 0,
          adRevenue: creatorEarnings,
        },
      });
    }

    await Ad.findByIdAndUpdate(adId, {
      $inc: { [type === 'impression' ? 'impressions' : 'clicks']: 1 },
    });

    res.json({ success: true, credited: creatorEarnings });
  } catch (error) {
    console.error('Ad tracking error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAdConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await AdConfig.getConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

export const updateAdConfig = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cpm, cpc, sharePercent } = req.body;
    const admin = req.user as IUser;
    if (!admin.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }

    const config = await AdConfig.getConfig();
    if (cpm !== undefined) config.cpm = cpm;
    if (cpc !== undefined) config.cpc = cpc;
    if (sharePercent !== undefined) config.sharePercent = sharePercent;
    config.updatedBy = admin._id;
    config.updatedAt = new Date();
    await config.save();

    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
};

export const getUserAdEarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const posts = await Post.find({ authorId: user._id })
      .select('title adImpressions adClicks adRevenue createdAt')
      .sort('-createdAt');

    const totalEarnings = posts.reduce((sum, p) => sum + (p.adRevenue || 0), 0);

    res.json({
      success: true,
      data: {
        totalEarnings,
        posts: posts.map((p) => ({
          id: p._id,
          title: p.title,
          impressions: p.adImpressions || 0,
          clicks: p.adClicks || 0,
          earnings: p.adRevenue || 0,
          date: p.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
