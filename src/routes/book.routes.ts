// ============================================================
// FILE: src/routes/book.routes.ts (FIXED ORDER – static routes first)
// ============================================================

import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── PUBLIC ROUTES (no auth) ──────────────────────────────────────────
// List all published books (static)
router.get('/', bookController.listBooks);

// Track a book view (static)
router.post('/:id/view', bookController.trackBookView);

// ─── AUTHENTICATED STATIC ROUTES ──────────────────────────────────────
// These must be defined BEFORE the dynamic /:id route
router.use(authenticate);

// User submits a book for approval (Premium users)
router.post('/submit', bookController.submitBookForApproval);

// User's purchased books library – static route
router.get('/purchased', bookController.getPurchasedBooks);

// Download book (requires purchase if paid)
router.post('/:id/download', bookController.downloadBook);

// Purchase book via Paystack
router.post('/purchase', bookController.purchaseBook);

// Verify book purchase
router.post('/verify-purchase', bookController.verifyBookPurchase);

// ─── ADMIN ROUTES (static) ─────────────────────────────────────────────
router.use(authorize('admin'));

router.get('/admin/all', bookController.listAllBooks);
router.get('/admin/stats', bookController.getBookStats);
router.get('/admin/:id', bookController.getBookById);
router.post('/admin', bookController.createBook);
router.put('/admin/:id', bookController.updateBook);
router.delete('/admin/:id', bookController.deleteBook);
router.post('/admin/:id/approve', bookController.approveBook);
router.post('/admin/:id/reject', bookController.rejectBook);

// ─── PUBLIC DYNAMIC ROUTE (MUST BE LAST) ─────────────────────────────
// Get a single book by ID – this will match any GET request to /books/:id
// that hasn't been handled by a static route above.
router.get('/:id', bookController.getBook);

export default router;
