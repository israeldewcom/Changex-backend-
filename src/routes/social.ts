// ============================================
// FILE: src/routes/social.ts (new)
// ============================================
import { Router } from 'express';
import { SocialController } from '../controllers/SocialController';
import { authenticate } from '../middleware/auth';
import { validateCreatePost, validateCreateComment, validatePagination } from '../middleware/validation';

const router = Router();
const socialController = new SocialController();

router.use(authenticate);
router.post('/posts', validateCreatePost, socialController.createPost);
router.get('/feed', validatePagination, socialController.getFeed);
router.post('/posts/:postId/like', socialController.likePost);
router.post('/posts/:postId/comments', validateCreateComment, socialController.addComment);
router.get('/posts/:postId/comments', validatePagination, socialController.getComments);

export default router;
