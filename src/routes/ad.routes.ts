import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// ─── Public routes (no auth) ──────────────────────────────────────────
router.get('/placement/:placement', adminController.getActiveAds);
router.post('/:id/impression', adminController.trackAdImpression);
router.post('/:id/click', adminController.trackAdClick);

// ─── Admin only ────────────────────────────────────────────────────────
router.use(authenticate);
router.use((req, res, next) => {
  if (!(req.user as any)?.roles?.includes('admin')) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
});

router.post('/', adminController.createAd);
router.get('/', adminController.getAds);
router.put('/:id', adminController.updateAd);
router.delete('/:id', adminController.deleteAd);

export default router;
