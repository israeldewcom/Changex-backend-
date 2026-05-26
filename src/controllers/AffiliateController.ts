// ============================================
// FILE: src/controllers/AffiliateController.ts (Complete)
// ============================================
import { Request, Response } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { User } from '../models/User';

export class AffiliateController {
  private affiliateService: AffiliateService;
  
  constructor() {
    this.affiliateService = AffiliateService.getInstance();
  }

  generateLink = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { courseId } = req.query;
      if (!courseId) {
        res.status(400).json({ success: false, message: 'courseId required' });
        return;
      }
      const { code, link } = await this.affiliateService.generateAffiliateLink(userId, courseId as string);
      res.json({ success: true, data: { code, link } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  acceptOffer = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { courseId } = req.body;
      if (!courseId) {
        res.status(400).json({ success: false, message: 'courseId required' });
        return;
      }
      const { code, link } = await this.affiliateService.acceptAffiliateOffer(userId, courseId);
      res.json({ success: true, data: { code, link } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getMyLinks = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const links = await this.affiliateService.getMyAffiliateLinks(userId);
      res.json({ success: true, data: { links } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const stats = await this.affiliateService.getAffiliateStats(userId);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const leaders = await User.aggregate([
        { $unwind: '$affiliateLinks' },
        {
          $group: {
            _id: '$_id',
            firstName: { $first: '$firstName' },
            lastName: { $first: '$lastName' },
            displayName: { $first: '$displayName' },
            totalAffiliateEarnings: { $sum: '$affiliateLinks.totalEarned' },
            totalAffiliateConversions: { $sum: '$affiliateLinks.conversions' },
            affiliateLinksCount: { $sum: 1 }
          }
        },
        { $sort: { totalAffiliateEarnings: -1 } },
        { $limit: 20 }
      ]);
      res.json({ success: true, data: leaders });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
