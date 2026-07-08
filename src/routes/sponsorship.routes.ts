import { Router } from 'express';
import * as sponsorshipController from '../controllers/sponsorship.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/submit', sponsorshipController.submitSponsorship);
router.get('/my', sponsorshipController.getMySponsorships);

router.use(authorize('admin'));

router.get('/admin/all', sponsorshipController.adminGetSponsorships);
router.post('/admin/:id/approve', sponsorshipController.approveSponsorship);
router.post('/admin/:id/reject', sponsorshipController.rejectSponsorship);

export default router;
