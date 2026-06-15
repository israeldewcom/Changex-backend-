import { Router } from 'express';
import * as postController from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// Public routes
router.get('/', postController.getAllPosts);
router.get('/slug/:slug', postController.getPostBySlug);
router.get('/user/:userId', postController.getUserPosts);
router.get('/:id', postController.getPostById);
router.get('/:postId/comments', postController.getComments);

// Authenticated routes
router.use(authenticate);
router.post('/', postController.createPost);
router.put('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);
router.post('/:id/like', postController.likePost);
router.post('/:id/unlike', postController.unlikePost);
router.post('/comments', postController.addComment);

export default router;
