// ============================================
// FILE: src/controllers/ReferralController.ts (Complete)
// ============================================
import { Request, Response } from 'express';
import { Referral } from '../models/Referral';
import { User } from '../models/User';

export class ReferralController {
  getMyReferrals = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const referrals = await Referral.find({ referrer: userId })
        .populate('referred', 'firstName lastName email createdAt')
        .sort({ createdAt: -1 });
      const stats = {
        total: referrals.length,
        pending: referrals.filter(r => r.status === 'pending').length,
        active: referrals.filter(r => r.status === 'active').length,
        completed: referrals.filter(r => r.status === 'completed').length,
        totalCommission: referrals.reduce((sum, r) => sum + r.totalCommission, 0)
      };
      res.json({ success: true, data: { referrals, stats } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
