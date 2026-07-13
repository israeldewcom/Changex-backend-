// ============================================================
// FILE: src/routes/articles.routes.ts (FINAL FIXED)
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
  getAdminArticles,
  getArticleStats,
  approveArticle,
  rejectArticle,
} from '../controllers/article.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── PUBLIC ROUTES (no auth) ──────────────────────────────────────────────────────
router.get('/', getPublishedArticles);
router.post('/:id/view', trackArticleView);

// ─── STATIC AUTHENTICATED ROUTES (must come before dynamic /:slug) ──────────────
router.use(authenticate);

// User creates/submits an article (Premium required)
router.post('/create', submitArticleForApproval);

// Get user's own articles
router.get('/my', getMyArticles);

// Get a specific article (for editing) – note: this is also static path /:id/detail
router.get('/:id/detail', getArticleById);

// Update an article (draft or pending)
router.put('/:id', updateArticle);

// Delete an article (draft only)
router.delete('/:id', deleteArticle);

// Purchase an article
router.post('/:id/purchase', purchaseArticle);
router.post('/verify-purchase', verifyArticlePurchase);

// ─── ADMIN ROUTES (also defined in admin.routes.ts, but frontend calls /articles/admin/*) ──
router.use(authorize('admin'));

router.get('/admin/all', getAdminArticles);
router.get('/admin/stats', getArticleStats);
router.post('/admin/:id/approve', approveArticle);
router.post('/admin/:id/reject', rejectArticle);

// ─── DYNAMIC ROUTE (MUST BE LAST) ──────────────────────────────────────────────────
// Get article by slug – this will match any GET request to /articles/:slug
// but since /my, /admin/*, /:id/detail, etc. are defined above, they take precedence.
router.get('/:slug', getArticleBySlug);

export default router;
