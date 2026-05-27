// src/routes/affiliate.routes.ts
import { Router } from 'express';
import * as affiliateController from '../controllers/affiliate.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.get('/track/:code', affiliateController.trackAffiliateClick);
router.use(authenticate);
router.post('/accept', affiliateController.acceptAffiliateOffer);
router.get('/my-links', affiliateController.getMyLinks);
router.get('/stats', affiliateController.getAffiliateStats);
router.get('/leaderboard', affiliateController.getAffiliateLeaderboard);

export default router;
