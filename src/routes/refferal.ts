// ============================================
// FILE: src/routes/referrals.ts (New)
// ============================================
import { Router } from 'express';
import { ReferralController } from '../controllers/ReferralController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new ReferralController();

router.get('/my', authenticate, controller.getMyReferrals);

export default router;
