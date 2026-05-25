// ============================================
// FILE: src/controllers/AffiliateController.ts (Complete – generates codes, tracks everything)
// ============================================
import { Request, Response } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { Course } from '../models/Course';

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
      await this.affiliateService.trackClick(userId, courseId, code, ip, userAgent);
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
}
