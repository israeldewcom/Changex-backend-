import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.post('/:userId/follow', (req, res) => {
  res.json({ success: true, followed: true, message: 'Followed' });
});

router.get('/:userId/followers', (req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/:userId/following', (req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/:userId/stats', (req, res) => {
  res.json({ success: true, data: { followers: 0, following: 0 } });
});

router.get('/:userId/status', (req, res) => {
  res.json({ success: true, data: { isFollowing: false } });
});

export default router;
