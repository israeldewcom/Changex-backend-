import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { Referral } from '../models/Referral';

const router = Router();

router.get('/my', authenticate, async (req, res) => {
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
});

export default router;
