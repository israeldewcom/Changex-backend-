import { Router } from 'express';
import * as postController from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/', postController.getPublishedPosts);
router.get('/slug/:slug', postController.getPostBySlug);
router.get('/user/:userId', postController.getUserPosts);

// Authenticated routes
router.use(authenticate);
router.get('/following', postController.getFollowingFeed); // NEW
router.post('/', postController.createPost);
router.put('/:id', postController.updatePost);
router.put('/:id/publish', postController.publishPost);
router.delete('/:id', postController.deletePost);
router.post('/:id/like', postController.likePost);
router.post('/:id/comment', postController.addComment);
router.get('/:id/comments', postController.getComments);
router.post('/comment/:id/like', postController.likeComment);
router.post('/:id/share', postController.sharePost);

export default router;
