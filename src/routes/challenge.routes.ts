import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public routes - get active challenges
router.get('/active', async (req, res) => {
  const Challenge = (await import('../models/Challenge.js')).default;
  const now = new Date();
  const challenges = await Challenge.find({
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort('-startDate');
  res.json({ success: true, data: challenges });
});

router.get('/upcoming', async (req, res) => {
  const Challenge = (await import('../models/Challenge.js')).default;
  const now = new Date();
  const challenges = await Challenge.find({
    status: 'upcoming',
    startDate: { $gt: now }
  }).sort('startDate');
  res.json({ success: true, data: challenges });
});

// Authenticated routes
router.use(authenticate);
router.post('/:id/join', adminController.joinChallenge);

// Admin only
router.use(authorize('admin'));
router.post('/', adminController.createChallenge);
router.get('/all', adminController.getChallenges);
router.put('/:id', adminController.updateChallenge);
router.delete('/:id', adminController.deleteChallenge);

export default router;
