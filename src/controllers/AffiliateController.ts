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
      
      const result = await this.affiliateService.acceptAffiliateOffer(userId, courseId);
      
      res.json({ success: true, data: { link: result.link, courseTitle: course.title, commissionRate: course.affiliatePercent || 15 } });
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
