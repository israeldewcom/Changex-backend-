// ============================================================
// FILE: src/routes/ad.routes.ts (UPDATED)
// ============================================================

import { Router } from 'express';
import * as adController from '../controllers/ad.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── Public routes (no auth required) ──────────────────────────
router.get('/placement/:placement', adController.getActiveAds);
router.post('/:id/impression', adController.trackAdImpression);
router.post('/:id/click', adController.trackAdClick);

// ─── NEW: Hybrid ad tracking (authenticated optional) ──────────
router.post('/track', adController.trackAdEvent); // can be called with or without auth

// ─── Admin only ──────────────────────────────────────────────────
router.use(authenticate);
router.use(authorize('admin'));

// ─── Existing admin routes ──────────────────────────────────────
router.post('/', adController.createAd);
router.get('/', adController.getAds);
router.put('/:id', adController.updateAd);
router.delete('/:id', adController.deleteAd);

// ─── NEW: Ad config (admin only) ────────────────────────────────
router.get('/config', adController.getAdConfig);
router.put('/config', adController.updateAdConfig);

export default router;
