// ============================================================
// FILE: src/routes/academy.routes.ts
// ============================================================

import { Router } from 'express';
import {
  createAcademy,
  getAcademy,
  updateAcademy,
  deleteAcademy,
  getAcademyMembers,
  updateMembershipRole,
  removeMember,
  applyToAcademy,
  getAcademyCourses,
  updateAcademyBranding,
  addCustomDomain,
  verifyCustomDomain,
  getAcademyStats,
} from '../controllers/academy.controller.js';
import { authenticate, academyAuth, authorize } from '../middlewares/auth.js';

const router = Router();

// ─── All academy routes require authentication ──────────────────────
router.use(authenticate);

// ─── Academy CRUD ────────────────────────────────────────────────────
router.post('/', createAcademy);
router.get('/:id', getAcademy);
router.put('/:id', updateAcademy);
router.delete('/:id', deleteAcademy);

// ─── Academy membership ──────────────────────────────────────────────
router.get('/:id/members', getAcademyMembers);
router.put('/:id/members/:membershipId', updateMembershipRole);
router.delete('/:id/members/:membershipId', removeMember);
router.post('/:id/apply', applyToAcademy);

// ─── Academy courses ──────────────────────────────────────────────────
router.get('/:id/courses', getAcademyCourses);

// ─── Academy branding ────────────────────────────────────────────────
router.put('/:id/branding', updateAcademyBranding);

// ─── Academy custom domains ──────────────────────────────────────────
router.post('/:id/domains', addCustomDomain);
router.post('/:id/domains/:domainId/verify', verifyCustomDomain);

// ─── Academy stats ──────────────────────────────────────────────────
router.get('/:id/stats', getAcademyStats);

export default router;
