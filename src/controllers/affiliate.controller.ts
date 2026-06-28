// ============================================================
// FILE: src/controllers/affiliate.controller.ts (COMPLETE)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import AffiliateLink from '../models/AffiliateLink.js';
import Course from '../models/Course.js';
import User, { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { v4 as uuid } from 'uuid';

/**
 * Accept an affiliate offer for a course.
 * Creates a unique affiliate link for the user with a clean, shareable URL.
 */
export const acceptAffiliateOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.body;
    const user = req.user as IUser;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Validate course exists and has affiliate enabled
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (!course.hasAffiliate) {
      return res.status(400).json({ success: false, message: 'Affiliate not available for this course' });
    }

    // Check if affiliate link already exists for this user and course
    let link = await AffiliateLink.findOne({ userId: user._id, courseId });

    if (link) {
      // Return existing link with clean URL format (no hash)
      const fullLink = `${process.env.CLIENT_URL}/courses/${courseId}?aff=${link.code}`;
      return res.json({
        success: true,
        data: {
          ...link.toObject(),
          link: fullLink
        }
      });
    }

    // Generate unique affiliate code
    const code = uuid().slice(0, 8).toUpperCase();

    // Create new affiliate link
    link = await AffiliateLink.create({
      userId: user._id,
      courseId,
      code,
      clicks: 0,
      conversions: 0,
      totalEarned: 0,
    });

    // ✅ Build clean, shareable URL for SPA
    const fullLink = `${process.env.CLIENT_URL}/courses/${courseId}?aff=${code}`;

    // Send notification to user
    await Notification.create({
      userId: user._id,
      title: '✅ Affiliate Link Created',
      message: `Your affiliate link for "${course.title}" is ready! Share it and earn ${course.affiliatePercent || 15}% commission per sale.`,
      type: 'affiliate',
      data: { courseId, linkId: link._id }
    });

    res.status(201).json({
      success: true,
      data: {
        ...link.toObject(),
        link: fullLink
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all affiliate links for the authenticated user.
 */
export const getMyLinks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const links = await AffiliateLink.find({ userId: user._id })
      .populate('courseId', 'title price affiliatePercent thumbnail')
      .sort('-createdAt');

    // Enrich each link with a clean full URL
    const enriched = links.map(l => {
      const course = l.courseId as any;
      const courseId = course?._id || l.courseId;
      return {
        ...l.toObject(),
        link: `${process.env.CLIENT_URL}/courses/${courseId}?aff=${l.code}`,
        courseTitle: course?.title || 'Course',
        coursePrice: course?.price || 0,
        affiliatePercent: course?.affiliatePercent || 15,
      };
    });

    res.json({
      success: true,
      data: { links: enriched }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Track affiliate click and redirect to course page with clean URL.
 */
export const trackAffiliateClick = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;

    if (!code) {
      return res.redirect(process.env.CLIENT_URL || '/');
    }

    // Find the affiliate link
    const link = await AffiliateLink.findOne({ code });
    if (!link) {
      return res.redirect(process.env.CLIENT_URL || '/');
    }

    // Increment click count
    link.clicks += 1;
    await link.save();

    // Set affiliate cookie for tracking purchases (30-day expiry)
    res.cookie('affiliate_code', code, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      path: '/',
    });

    // ✅ Redirect to clean URL (no hash)
    const redirectUrl = `${process.env.CLIENT_URL}/courses/${link.courseId}?aff=${code}`;
    res.redirect(redirectUrl);
  } catch (err) {
    next(err);
  }
};

/**
 * Get affiliate statistics for the authenticated user.
 */
export const getAffiliateStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const links = await AffiliateLink.find({ userId: user._id });

    const totalClicks = links.reduce((acc, l) => acc + (l.clicks || 0), 0);
    const totalConversions = links.reduce((acc, l) => acc + (l.conversions || 0), 0);
    const totalEarned = links.reduce((acc, l) => acc + (l.totalEarned || 0), 0);

    // Count unique signups attributed to affiliate
    const totalSignups = await User.countDocuments({
      referredBy: user._id,
      isPremium: true // Only count converted signups
    });

    res.json({
      success: true,
      data: {
        totalClicks,
        totalConversions,
        totalEarned,
        totalSignups,
        linksCount: links.length,
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get affiliate leaderboard (top affiliates by earnings).
 */
export const getAffiliateLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20 } = req.query;

    const leaderboard = await User.aggregate([
      {
        $lookup: {
          from: 'affiliatelinks',
          localField: '_id',
          foreignField: 'userId',
          as: 'links'
        }
      },
      {
        $addFields: {
          totalAffiliateEarnings: { $sum: '$links.totalEarned' },
          totalAffiliateConversions: { $sum: '$links.conversions' },
          affiliateLinksCount: { $size: '$links' },
          totalAffiliateClicks: { $sum: '$links.clicks' },
        }
      },
      {
        $match: {
          totalAffiliateEarnings: { $gt: 0 }
        }
      },
      {
        $sort: { totalAffiliateEarnings: -1 }
      },
      {
        $limit: Number(limit)
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          email: 1,
          avatarUrl: 1,
          totalAffiliateEarnings: 1,
          totalAffiliateConversions: 1,
          totalAffiliateClicks: 1,
          affiliateLinksCount: 1,
        }
      }
    ]);

    res.json({
      success: true,
      data: leaderboard
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get course-specific affiliate stats for the authenticated user.
 */
export const getCourseAffiliateStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const link = await AffiliateLink.findOne({ userId: user._id, courseId })
      .populate('courseId', 'title price affiliatePercent');

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'No affiliate link found for this course'
      });
    }

    const course = link.courseId as any;
    const fullLink = `${process.env.CLIENT_URL}/courses/${courseId}?aff=${link.code}`;

    res.json({
      success: true,
      data: {
        ...link.toObject(),
        link: fullLink,
        courseTitle: course?.title || 'Course',
        coursePrice: course?.price || 0,
        affiliatePercent: course?.affiliatePercent || 15,
        estimatedCommissionPerSale: (course?.price || 0) * ((course?.affiliatePercent || 15) / 100),
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Withdraw affiliate earnings to wallet.
 * Uses Transaction collection to track total withdrawn.
 */
export const withdrawAffiliateEarnings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { amount } = req.body;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!amount || amount < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₦1,000'
      });
    }

    // Get total affiliate earnings
    const links = await AffiliateLink.find({ userId: user._id });
    const totalEarned = links.reduce((acc, l) => acc + (l.totalEarned || 0), 0);

    // Calculate total already withdrawn from affiliate earnings
    const withdrawals = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: 'affiliate_withdrawal',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    const alreadyWithdrawn = withdrawals.length > 0 ? withdrawals[0].total : 0;
    const available = totalEarned - alreadyWithdrawn;

    if (amount > available) {
      return res.status(400).json({
        success: false,
        message: `Insufficient affiliate earnings. Available: ₦${available.toLocaleString()}`
      });
    }

    // Transfer to wallet
    user.walletBalance = (user.walletBalance || 0) + amount;
    await user.save();

    // Record withdrawal transaction
    await Transaction.create({
      userId: user._id,
      type: 'affiliate_withdrawal',
      amount: amount,
      status: 'completed',
      description: 'Withdrawal of affiliate earnings to wallet',
      metadata: { source: 'affiliate_earnings' }
    });

    res.json({
      success: true,
      message: `₦${amount.toLocaleString()} transferred to your wallet`,
      data: {
        transferred: amount,
        walletBalance: user.walletBalance,
        remainingAffiliateEarnings: available - amount,
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get total affiliate earnings summary for the authenticated user.
 */
export const getAffiliateEarningsSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const links = await AffiliateLink.find({ userId: user._id });
    const totalEarned = links.reduce((acc, l) => acc + (l.totalEarned || 0), 0);

    // Calculate withdrawn amount
    const withdrawals = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: 'affiliate_withdrawal',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    const alreadyWithdrawn = withdrawals.length > 0 ? withdrawals[0].total : 0;
    const available = totalEarned - alreadyWithdrawn;

    // Breakdown by course
    const breakdown = await Promise.all(links.map(async (l) => {
      const course = await Course.findById(l.courseId).select('title price affiliatePercent');
      return {
        courseId: l.courseId,
        courseTitle: course?.title || 'Course',
        price: course?.price || 0,
        affiliatePercent: course?.affiliatePercent || 15,
        clicks: l.clicks || 0,
        conversions: l.conversions || 0,
        earned: l.totalEarned || 0,
        link: `${process.env.CLIENT_URL}/courses/${l.courseId}?aff=${l.code}`,
        code: l.code,
      };
    }));

    res.json({
      success: true,
      data: {
        totalEarned,
        available,
        alreadyWithdrawn,
        totalConversions: links.reduce((acc, l) => acc + (l.conversions || 0), 0),
        totalClicks: links.reduce((acc, l) => acc + (l.clicks || 0), 0),
        linksCount: links.length,
        breakdown,
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete an affiliate link (user can delete their own link).
 * Only if it has no conversions.
 */
export const deleteAffiliateLink = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { linkId } = req.params;

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const link = await AffiliateLink.findOne({ _id: linkId, userId: user._id });
    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'Affiliate link not found or not owned by you'
      });
    }

    if (link.conversions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a link that has already generated conversions'
      });
    }

    await link.deleteOne();

    res.json({
      success: true,
      message: 'Affiliate link deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Get all affiliate offers (courses with affiliate enabled).
 * Public endpoint for users to browse and accept offers.
 */
export const getAffiliateOffers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const courses = await Course.find({
      hasAffiliate: true,
      isPublished: true,
      approvalStatus: 'approved'
    })
      .populate('instructorId', 'firstName lastName')
      .sort('-createdAt')
      .skip(Number(offset))
      .limit(Number(limit))
      .select('title price affiliatePercent thumbnail description totalStudents rating');

    const total = await Course.countDocuments({
      hasAffiliate: true,
      isPublished: true,
      approvalStatus: 'approved'
    });

    let userLinks: any[] = [];
    if (req.user) {
      const user = req.user as IUser;
      userLinks = await AffiliateLink.find({ userId: user._id }).select('courseId code');
    }

    const enriched = courses.map(course => {
      const existingLink = userLinks.find(l => l.courseId.toString() === course._id.toString());
      return {
        ...course.toObject(),
        affiliateLink: existingLink ? {
          code: existingLink.code,
          link: `${process.env.CLIENT_URL}/courses/${course._id}?aff=${existingLink.code}`
        } : null,
        estimatedCommission: (course.price || 0) * ((course.affiliatePercent || 15) / 100),
      };
    });

    res.json({
      success: true,
      data: {
        offers: enriched,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

export default {
  acceptAffiliateOffer,
  getMyLinks,
  trackAffiliateClick,
  getAffiliateStats,
  getAffiliateLeaderboard,
  getCourseAffiliateStats,
  withdrawAffiliateEarnings,
  getAffiliateEarningsSummary,
  deleteAffiliateLink,
  getAffiliateOffers,
};
