// ============================================================
// FILE: src/routes/affiliate.routes.ts
// COMPLETE UPDATED VERSION
// ============================================================

import { Router } from 'express';
import {
    acceptAffiliateOffer,
    getMyLinks,
    trackAffiliateClick,
    getAffiliateStats,
    getAffiliateLeaderboard,
    getCourseAffiliateStats,
    withdrawAffiliateEarnings,
    getAffiliateEarningsSummary,
    deleteAffiliateLink,
    getAffiliateOffers,
} from '../controllers/affiliate.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// ─── Public route (no auth required) ──────────────────────────────────
// This must be placed BEFORE any authenticated routes to avoid conflicts
router.get('/track/:code', trackAffiliateClick);

// ─── All routes below require authentication ──────────────────────────
router.use(authenticate);

// Accept an affiliate offer for a specific course
router.post('/accept', acceptAffiliateOffer);

// Get all affiliate links for the authenticated user
router.get('/my-links', getMyLinks);

// Get affiliate statistics (clicks, conversions, earnings)
router.get('/stats', getAffiliateStats);

// Get affiliate leaderboard (top earners)
router.get('/leaderboard', getAffiliateLeaderboard);

// Get course-specific affiliate stats and link
router.get('/course/:courseId', getCourseAffiliateStats);

// Get detailed earnings summary with breakdown by course
router.get('/earnings/summary', getAffiliateEarningsSummary);

// Withdraw affiliate earnings to wallet
router.post('/withdraw', withdrawAffiliateEarnings);

// Delete an affiliate link (user-owned)
router.delete('/link/:linkId', deleteAffiliateLink);

// Get all available affiliate offers (courses with affiliate enabled)
router.get('/offers', getAffiliateOffers);

export default router;
