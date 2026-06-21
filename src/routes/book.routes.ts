import { Router } from 'express';
import * as bookController from '../controllers/book.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

// Public
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBook);

// Authenticated
router.use(authenticate);
router.post('/:id/download', bookController.downloadBook);
router.post('/purchase', bookController.purchaseBook);

// Admin
router.use(authorize('admin'));
router.post('/', bookController.createBook);
router.put('/:id', bookController.updateBook);
router.delete('/:id', bookController.deleteBook);

export default router;
