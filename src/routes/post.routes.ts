import { Router } from 'express';
import * as postController from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// Public routes (no auth)
router.get('/', postController.getPublishedPosts);
router.get('/slug/:slug', postController.getPostBySlug);
router.get('/user/:userId', postController.getUserPosts);
router.get('/:id/analytics', postController.getPostAnalytics);

// ─── Authenticated routes ────────────────────────────────────────────
router.use(authenticate);
router.get('/following', postController.getFollowingFeed);
router.get('/personalized', postController.getPersonalizedFeed);   // ✅ This is the "For You" route
router.post('/', postController.createPost);
router.put('/:id', postController.updatePost);
router.put('/:id/publish', postController.publishPost);
router.delete('/:id', postController.deletePost);
router.post('/:id/video', upload.single('video'), postController.uploadPostVideo);
router.post('/:id/like', postController.likePost);
router.post('/:id/comment', postController.addComment);
router.get('/:id/comments', postController.getComments);
router.post('/comment/:id/like', postController.likeComment);
router.post('/:id/share', postController.sharePost);
router.post('/:id/view', postController.trackPostView);
router.get('/my/social-earnings', postController.getMySocialEarnings);

export default router;
