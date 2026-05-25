// ============================================
// FILE: src/routes/affiliate.ts (complete)
// ============================================
import { Router } from 'express';
import { AffiliateController } from '../controllers/AffiliateController';
import { authenticate } from '../middleware/auth';

const router = Router();
const affiliateController = new AffiliateController();

router.get('/offers', affiliateController.getAvailableOffers);
router.get('/click/:userId/:courseId/:code', affiliateController.trackClick);
router.get('/leaderboard', affiliateController.getTopAffiliates);
router.use(authenticate);
router.post('/accept', affiliateController.acceptOffer);
router.get('/my-stats', affiliateController.getMyAffiliateStats);

export default router;
