import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/', (req, res) => {
  res.json({ success: true, data: { posts: [], pagination: { total: 0, page: 1, limit: 10, pages: 0 } } });
});

router.get('/slug/:slug', (req, res) => {
  res.json({ success: true, data: { title: 'Test Post', content: 'Hello' } });
});

router.get('/user/:userId', (req, res) => {
  res.json({ success: true, data: [] });
});

// Authenticated routes
router.use(authenticate);
router.post('/', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'test', title: req.body.title || 'New Post' } });
});

router.put('/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, updated: true } });
});

router.put('/:id/publish', (req, res) => {
  res.json({ success: true, data: { published: true } });
});

router.delete('/:id', (req, res) => {
  res.json({ success: true, message: 'Deleted' });
});

router.post('/:id/like', (req, res) => {
  res.json({ success: true, liked: true, likes: 1 });
});

router.post('/:id/comment', (req, res) => {
  res.status(201).json({ success: true, data: { _id: 'comment123', content: req.body.content } });
});

router.get('/:id/comments', (req, res) => {
  res.json({ success: true, data: [] });
});

router.post('/comment/:id/like', (req, res) => {
  res.json({ success: true, liked: true });
});

router.post('/:id/share', (req, res) => {
  res.json({ success: true, message: 'Shared' });
});

export default router;
