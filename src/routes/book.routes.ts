// ============================================================
// FILE: src/routes/book.routes.ts (FIXED – public getBook)
// ============================================================

import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── PUBLIC ROUTES (no auth) ──────────────────────────────────────────
// List published books
router.get('/', bookController.listBooks);

// Track a book view (public)
router.post('/:id/view', bookController.trackBookView);

// Get a single book by ID – PUBLIC (anyone can view book details)
router.get('/:id', bookController.getBook);

// ─── AUTHENTICATED ROUTES ─────────────────────────────────────────────
router.use(authenticate);

// User submits a book for approval (Premium users)
router.post('/submit', bookController.submitBookForApproval);

// STATIC route: User's purchased books library – MUST come before dynamic :id
router.get('/purchased', bookController.getPurchasedBooks);

// Download book (requires purchase if paid)
router.post('/:id/download', bookController.downloadBook);

// Purchase book via Paystack
router.post('/purchase', bookController.purchaseBook);

// Verify book purchase
router.post('/verify-purchase', bookController.verifyBookPurchase);

// ─── ADMIN ONLY ──────────────────────────────────────────────────────────
router.use(authorize('admin'));

// Admin CRUD and approval routes
router.get('/admin/all', bookController.listAllBooks);
router.get('/admin/stats', bookController.getBookStats);
router.get('/admin/:id', bookController.getBookById);
router.post('/admin', bookController.createBook);
router.put('/admin/:id', bookController.updateBook);
router.delete('/admin/:id', bookController.deleteBook);
router.post('/admin/:id/approve', bookController.approveBook);
router.post('/admin/:id/reject', bookController.rejectBook);

export default router;
