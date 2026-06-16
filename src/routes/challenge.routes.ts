import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/active', (req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/upcoming', (req, res) => {
  res.json({ success: true, data: [] });
});

router.get('/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, title: 'Test Challenge' } });
});

// Authenticated
router.use(authenticate);
router.post('/:id/join', (req, res) => {
  res.json({ success: true, message: 'Joined' });
});

router.get('/user/my', (req, res) => {
  res.json({ success: true, data: [] });
});

// Admin only
router.use(authorize('admin'));
router.post('/', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'new', ...req.body } });
});

router.get('/all', (req, res) => {
  res.json({ success: true, data: [] });
});

router.put('/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, updated: true } });
});

router.delete('/:id', (req, res) => {
  res.json({ success: true, message: 'Deleted' });
});

export default router;
