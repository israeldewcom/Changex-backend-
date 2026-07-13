// ============================================================
// FILE: src/routes/analytics.routes.ts
// ============================================================

import { Router } from 'express';
import {
  getCourseAnalytics,
  getRevenueAnalytics,
  getStudentAnalytics,
  getEngagementAnalytics,
  getFunnelAnalytics,
} from '../controllers/analytics.controller.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);
router.use(authorize('instructor', 'admin'));

router.get('/courses/:courseId', getCourseAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/students', getStudentAnalytics);
router.get('/engagement', getEngagementAnalytics);
router.get('/funnel/:courseId', getFunnelAnalytics);

export default router;
