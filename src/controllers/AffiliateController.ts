// ============================================
// FILE: src/controllers/AffiliateController.ts (Complete – tracks clicks, signups, conversions)
// ============================================
import { Request, Response } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { Course } from '../models/Course';
import { User } from '../models/User';
import { Referral } from '../models/Referral';
import { AffiliateClick } from '../models/AffiliateClick';

export class AffiliateController {
  private affiliateService: AffiliateService;

  constructor() {
    this.affiliateService = AffiliateService.getInstance();
  }

  getAvailableOffers = async (req: Request, res: Response): Promise<void> => {
    try {
      const courses = await Course.find({
        published: true,
        approvalStatus: 'approved',
        hasAffiliate: true,
        price: { $gt: 0 }
      }).select('title thumbnail price discountPrice affiliatePercent affiliateDescription instructor');
      res.json({ success: true, data: courses });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  acceptOffer = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { courseId } = req.body;
      const result = await this.affiliateService.acceptAffiliateOffer(userId, courseId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  getMyAffiliateStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const stats = await this.affiliateService.getAffiliateStats(userId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  trackClick = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, courseId, code } = req.params;
      const ip = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('user-agent') || '';
      
      // Track the click
      await this.affiliateService.trackClick(userId, courseId, code, ip, userAgent);
      
      // Set cookie for 30 days (fallback for older browsers)
      res.cookie('cx_affiliate', `${userId}|${courseId}|${code}`, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        path: '/'
      });
      
      // Redirect to frontend course page
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${courseId}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${req.params.courseId}`);
    }
  };

  getTopAffiliates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit = 10 } = req.query;
      const topAffiliates = await this.affiliateService.getTopAffiliates(Number(limit));
      res.json({ success: true, data: topAffiliates });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  getClickAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { days = 30 } = req.query;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));
      
      const clicks = await AffiliateClick.aggregate([
        { $match: { affiliateId: new (require('mongoose').Types.ObjectId)(userId), clickedAt: { $gte: startDate } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$clickedAt' } },
            count: { $sum: 1 }
          } },
        { $sort: { _id: 1 } }
      ]);
      
      const totalClicks = await AffiliateClick.countDocuments({ affiliateId: userId });
      const uniqueCourses = await AffiliateClick.distinct('courseId', { affiliateId: userId });
      
      res.json({
        success: true,
        data: {
          dailyClicks: clicks,
          totalClicks,
          uniqueCoursesClicked: uniqueCourses.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
