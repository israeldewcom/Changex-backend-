import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public view
router.get('/lesson/:lessonId', (req, res) => {
  res.json({ success: true, data: [] });
});

// Authenticated (instructors only)
router.use(authenticate, authorize('instructor', 'admin'));
router.post('/lesson/:lessonId', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'new', ...req.body } });
});

router.put('/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, updated: true } });
});

router.delete('/:id', (req, res) => {
  res.json({ success: true, message: 'Deleted' });
});

router.post('/lesson/:lessonId/reorder', (req, res) => {
  res.json({ success: true, message: 'Reordered' });
});

export default router;
