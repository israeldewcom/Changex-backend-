// ============================================
// FILE: src/routes/affiliate.ts (New)
// ============================================
import { Router } from 'express';
import { AffiliateController } from '../controllers/AffiliateController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new AffiliateController();

router.get('/generate-link', authenticate, controller.generateLink);
router.get('/my-links', authenticate, controller.getMyLinks);
router.get('/stats', authenticate, controller.getStats);
router.get('/leaderboard', controller.getLeaderboard);

export default router;
