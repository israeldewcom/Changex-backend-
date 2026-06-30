// ============================================================
// FILE: src/routes/cohort.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  createCohort,
  getCohorts,
  getCohort,
  updateCohort,
  deleteCohort,
  addStudent,
  removeStudent,
} from '../controllers/cohort.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('instructor', 'admin'));

router.post('/', createCohort);
router.get('/', getCohorts);
router.get('/:id', getCohort);
router.put('/:id', updateCohort);
router.delete('/:id', deleteCohort);
router.post('/:id/students', addStudent);
router.delete('/:id/students/:userId', removeStudent);

export default router;
