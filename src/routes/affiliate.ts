import { Router } from 'express';
import { AffiliateController } from '../controllers/AffiliateController';
import { authenticate } from '../middleware/auth';

const router = Router();
const affiliateController = new AffiliateController();

// Public route for tracking clicks (no auth required)
router.get('/track/:userId/:courseId/:code', affiliateController.trackClick);

// Protected routes (require authentication)
router.use(authenticate);
router.get('/offers', affiliateController.getAvailableOffers);
router.post('/offers/accept', affiliateController.acceptOffer);
router.get('/my-stats', affiliateController.getMyAffiliateStats);
router.get('/leaderboard', affiliateController.getTopAffiliates);

export default router;
