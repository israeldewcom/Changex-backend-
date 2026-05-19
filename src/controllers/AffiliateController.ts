import { Request, Response } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { Course } from '../models/Course';

export class AffiliateController {
  private affiliateService: AffiliateService;

  constructor() {
    this.affiliateService = AffiliateService.getInstance();
  }

  // ✅ Get available affiliate offers (courses with affiliate enabled)
  getAvailableOffers = async (req: Request, res: Response): Promise<void> => {
    try {
      const courses = await Course.find({ 
        published: true, 
        approvalStatus: 'approved',
        hasAffiliate: true 
      }).select('title thumbnail price discountPrice affiliatePercent affiliateDescription instructor');
      
      res.json({ success: true, data: courses });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // ✅ Accept an affiliate offer
  acceptOffer = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { courseId } = req.body;
      
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      if (!course.hasAffiliate) {
        res.status(400).json({ success: false, message: 'Affiliate not enabled for this course' });
        return;
      }
      
      // This method should be implemented in UserController
      // For now, we'll handle it directly
      const User = require('../models/User').User;
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      const existing = user.affiliateLinks?.find((l: any) => l.courseId.toString() === courseId);
      if (existing) {
        res.status(400).json({ success: false, message: 'Affiliate offer already accepted' });
        return;
      }
      
      const uniqueId = Math.random().toString(36).substr(2, 8);
      const affiliateLink = `${process.env.FRONTEND_URL}/aff/${userId}/${courseId}/${uniqueId}`;
      
      if (!user.affiliateLinks) user.affiliateLinks = [];
      user.affiliateLinks.push({
        courseId: course._id,
        courseTitle: course.title,
        link: affiliateLink,
        clicks: 0,
        signups: 0,
        conversions: 0,
        commissionRate: course.affiliatePercent || 15,
        totalEarned: 0,
        createdAt: new Date()
      });
      await user.save();
      
      res.json({ success: true, data: { link: affiliateLink, courseTitle: course.title, commissionRate: course.affiliatePercent || 15 } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  // ✅ Get user's affiliate stats
  getMyAffiliateStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const stats = await this.affiliateService.getAffiliateStats(userId);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // ✅ Track affiliate link click (public, no auth)
  trackClick = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, courseId, code } = req.params;
      const ip = req.ip || req.socket.remoteAddress || '';
      const userAgent = req.get('user-agent') || '';
      
      await this.affiliateService.trackClick(userId, courseId, code, ip, userAgent);
      
      // Set cookie and redirect to course page
      res.cookie('cx_affiliate', `${userId}|${courseId}|${code}`, { 
        maxAge: 30 * 24 * 60 * 60 * 1000, 
        httpOnly: false, 
        path: '/' 
      });
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${courseId}`);
    } catch (error) {
      res.redirect(`${process.env.FRONTEND_URL}/#/courses/${req.params.courseId}`);
    }
  };

  // ✅ Get top affiliates for leaderboard
  getTopAffiliates = async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit = 10 } = req.query;
      const topAffiliates = await this.affiliateService.getTopAffiliates(Number(limit));
      res.json({ success: true, data: topAffiliates });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
