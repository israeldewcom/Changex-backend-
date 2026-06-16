import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// Public
router.get('/placement/:placement', (req, res) => {
  res.json({ success: true, data: [] });
});

router.post('/:id/impression', (req, res) => {
  res.json({ success: true });
});

router.post('/:id/click', (req, res) => {
  res.json({ success: true, redirectUrl: 'https://changex.academy' });
});

// Admin only (for management)
router.use(authenticate);
router.use((req, res, next) => {
  if (!(req.user as any)?.roles?.includes('admin')) {
    return res.status(403).json({ success: false, message: 'Admin only' });
  }
  next();
});
router.post('/', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'new', ...req.body } });
});
router.get('/', (req, res) => {
  res.json({ success: true, data: [] });
});
router.put('/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, updated: true } });
});
router.delete('/:id', (req, res) => {
  res.json({ success: true, message: 'Deleted' });
});

export default router;
