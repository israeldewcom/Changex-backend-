// ============================================================
// FILE: src/routes/split.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  createSplit,
  getSplits,
  updateSplit,
  deleteSplit,
} from '../controllers/split.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('instructor', 'admin'));

router.post('/', createSplit);
router.get('/', getSplits);
router.put('/:id', updateSplit);
router.delete('/:id', deleteSplit);

export default router;
