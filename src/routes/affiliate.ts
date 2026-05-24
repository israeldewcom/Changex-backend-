// ============================================
// FILE: src/routes/affiliate.ts (full)
// ============================================
import { Router } from 'express';
import { AffiliateController } from '../controllers/AffiliateController';
import { authenticate } from '../middleware/auth';

const router = Router();
const affiliateController = new AffiliateController();

// Public routes
router.get('/offers', affiliateController.getAvailableOffers);
router.get('/click/:userId/:courseId/:code', affiliateController.trackClick);
router.get('/leaderboard', affiliateController.getTopAffiliates);

// Protected routes
router.use(authenticate);
router.post('/accept', affiliateController.acceptOffer);
router.get('/my-stats', affiliateController.getMyAffiliateStats);

export default router;
