// ============================================================
// FILE: src/routes/campaign.routes.ts (UPDATED – added manual-pay route)
// ============================================================

import { Router } from 'express';
import * as campaignController from '../controllers/campaign.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── User routes ──────────────────────────────────────────────────────
router.use(authenticate);

router.post('/submit', upload.single('image'), campaignController.submitCampaign);
router.get('/my', campaignController.getMyCampaigns);
router.get('/:id/stats', campaignController.getCampaignStats);
router.put('/:id/toggle', campaignController.toggleCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// ─── Payment routes ──────────────────────────────────────────────────
router.post('/pay', campaignController.initializeCampaignPayment);
router.post('/:id/topup', campaignController.topUpCampaign);

// ─── NEW: Manual payment submission (user uploads receipt) ────────────
router.post('/manual-pay', upload.single('receipt'), campaignController.submitManualPayment);

// ─── Admin routes ─────────────────────────────────────────────────────
router.use(authorize('admin'));

router.get('/admin/all', campaignController.adminGetCampaigns);
router.get('/admin/:id', campaignController.adminGetCampaign);
router.post('/admin/:id/approve', campaignController.approveCampaign);
router.post('/admin/:id/reject', campaignController.rejectCampaign);
router.post('/admin/:id/refund', campaignController.refundCampaign);
router.post('/admin/:id/verify-manual', campaignController.verifyManualPayment);

export default router;
