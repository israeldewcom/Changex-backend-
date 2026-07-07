// ============================================================
// FILE: src/routes/post.routes.ts (FULLY UPDATED)
// ============================================================

import { Router } from 'express';
import {
  createPost,
  updatePost,
  publishPost,
  deletePost,
  uploadPostVideo,
  getPublishedPosts,
  getPostBySlug,
  likePost,
  addComment,
  getComments,
  likeComment,
  sharePost,
  getUserPosts,
  getFollowingFeed,
  trackPostView,
  getPostAnalytics,
  getMySocialEarnings,
  getMyPostTitles,
  getPersonalizedFeed,
  getPurchasedArticles,        // ✅ ADDED
  purchaseArticle,             // ✅ For paywall
  getPostPreview,              // ✅ For paywall
} from '../controllers/post.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

// ─── Public routes ─────────────────────────────────────────────────────
router.get('/', getPublishedPosts);
router.get('/slug/:slug', getPostBySlug);
router.get('/:id/comments', getComments);

// ─── Protected routes ──────────────────────────────────────────────────
router.use(authenticate);

router.post('/', createPost);
router.put('/:id', updatePost);
router.post('/:id/publish', publishPost);
router.delete('/:id', deletePost);
router.post('/:id/video', upload.single('video'), uploadPostVideo);
router.post('/:id/like', likePost);
router.post('/:id/comment', addComment);
router.post('/:id/share', sharePost);
router.post('/:id/view', trackPostView);
router.get('/:id/analytics', getPostAnalytics);
router.get('/following', getFollowingFeed);
router.get('/my/titles', getMyPostTitles);
router.get('/my/social-earnings', getMySocialEarnings);
router.get('/personalized', getPersonalizedFeed);
router.get('/user/:userId', getUserPosts);
router.post('/comment/:id/like', likeComment);

// ─── NEW ROUTES FOR PAID ARTICLES ─────────────────────────────────────
router.get('/purchased', getPurchasedArticles);       // ✅ ADDED
router.post('/:id/purchase', purchaseArticle);        // ✅ For purchase initiation
router.get('/:id/preview', getPostPreview);           // ✅ Preview for paywall

export default router;
