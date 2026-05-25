// ============================================
// FILE: src/controllers/AffiliateController.ts (Complete)
// ============================================
import { Request, Response } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { User } from '../models/User';
import { Course } from '../models/Course';

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

  getMyLinks = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId).populate('affiliateLinks.courseId', 'title price');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const links = user.affiliateLinks.map(link => ({
        id: link._id,
        courseId: link.courseId,
        courseTitle: (link.courseId as any)?.title || 'Course',
        code: link.code,
        clicks: link.clicks,
        conversions: link.conversions,
        totalEarned: link.totalEarned,
        link: `${process.env.FRONTEND_URL}/aff/${userId}/${link.courseId}/${link.code}`
      }));
      res.json({ success: true, data: links });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const totalClicks = user.affiliateLinks.reduce((sum, l) => sum + (l.clicks || 0), 0);
      const totalConversions = user.affiliateLinks.reduce((sum, l) => sum + (l.conversions || 0), 0);
      const totalEarned = user.affiliateLinks.reduce((sum, l) => sum + (l.totalEarned || 0), 0);
      res.json({
        success: true,
        data: {
          totalClicks,
          totalConversions,
          totalEarned,
          linksCount: user.affiliateLinks.length
        }
      });
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
