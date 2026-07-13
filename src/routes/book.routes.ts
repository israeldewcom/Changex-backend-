import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createBookSchema,
  updateBookSchema,
  purchaseSchema,
  downloadSchema,
  idParamSchema,
} from '../validators/book.validator.js';

const router = Router();

// ─── Public routes ──────────────────────────────────────────────────
// No authentication required
router.get('/', bookController.listBooks);
router.get('/:id', validate(idParamSchema, 'params'), bookController.getBook);

// ─── Protected routes (authentication required) ──────────────────
router.use(authenticate);

// Download book (user must be authenticated)
router.post(
  '/:id/download',
  validate(idParamSchema, 'params'),
  validate(downloadSchema, 'body'),
  bookController.downloadBook
);

// Purchase book (user must be authenticated)
router.post(
  '/purchase',
  validate(purchaseSchema, 'body'),
  bookController.purchaseBook
);

// ─── Admin only routes ────────────────────────────────────────────
router.use(authorize('admin'));

// Create a new book
router.post('/', validate(createBookSchema, 'body'), bookController.createBook);

// Update an existing book
router.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(updateBookSchema, 'body'),
  bookController.updateBook
);

// Delete a book
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  bookController.deleteBook
);

export default router;
