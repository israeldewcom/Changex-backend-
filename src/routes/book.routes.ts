// ============================================================
// FILE: src/routes/book.routes.ts
// ============================================================

import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── Public routes (no auth) ──────────────────────────────────────
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBook);

// ─── Authenticated routes ─────────────────────────────────────────
router.use(authenticate);

// NEW: Premium users can upload books (pending admin approval)
router.post('/', authorize('premium'), bookController.createBookByUser);

router.post('/:id/download', bookController.downloadBook);
router.post('/purchase', bookController.purchaseBook);

// ─── Admin only ────────────────────────────────────────────────────
router.use(authorize('admin'));
router.post('/admin', bookController.createBook);
router.put('/admin/:id', bookController.updateBook);
router.delete('/admin/:id', bookController.deleteBook);

export default router;
