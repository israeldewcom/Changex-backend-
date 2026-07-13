// ============================================================
// FILE: src/routes/articles.routes.ts (FIXED – removed createArticle)
// ============================================================

import { Router } from 'express';
import {
  getMyArticles,
  getArticleById,
  updateArticle,
  deleteArticle,
  submitArticleForApproval,
  getPublishedArticles,
  getArticleBySlug,
  purchaseArticle,
  verifyArticlePurchase,
  trackArticleView,
} from '../controllers/article.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────
router.get('/', getPublishedArticles);
router.get('/:slug', getArticleBySlug);
router.post('/:id/view', trackArticleView);

// ─── AUTHENTICATED ROUTES ──────────────────────────────────────────────
router.use(authenticate);

// User creates/submits an article (Premium required)
router.post('/create', submitArticleForApproval); // also used for drafts

// Get user's own articles
router.get('/my', getMyArticles);

// Get a specific article (for editing)
router.get('/:id/detail', getArticleById);

// Update an article (draft or pending)
router.put('/:id', updateArticle);

// Delete an article (draft only)
router.delete('/:id', deleteArticle);

// Purchase an article
router.post('/:id/purchase', purchaseArticle);
router.post('/verify-purchase', verifyArticlePurchase);

export default router;
