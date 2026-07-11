// ============================================================
// FILE: src/routes/book.routes.ts (COMPLETE FIXED)
// ============================================================

import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── Public routes ──────────────────────────────────────────────────
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBook);
router.post('/:id/view', bookController.trackBookView);

// ─── Authenticated routes ──────────────────────────────────────────
router.use(authenticate);

// User submits a book for approval (Premium users)
router.post('/submit', bookController.submitBookForApproval);

// User's purchased books library
router.get('/purchased', bookController.getPurchasedBooks);

// Download book (requires purchase if paid)
router.post('/:id/download', bookController.downloadBook);

// Purchase book via Paystack
router.post('/purchase', bookController.purchaseBook);

// Verify book purchase
router.post('/verify-purchase', bookController.verifyBookPurchase);

// ─── Admin only ────────────────────────────────────────────────────
router.use(authorize('admin'));

router.get('/admin/all', bookController.listAllBooks);
router.get('/admin/:id', bookController.getBookById);
router.post('/admin', bookController.createBook);
router.put('/admin/:id', bookController.updateBook);
router.delete('/admin/:id', bookController.deleteBook);
router.post('/admin/:id/approve', bookController.approveBook);
router.post('/admin/:id/reject', bookController.rejectBook);
router.get('/admin/stats', bookController.getBookStats);

export default router;
