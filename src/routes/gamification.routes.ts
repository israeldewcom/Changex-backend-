// ============================================================
// FILE: src/routes/gamification.routes.ts
// ============================================================

import { Router } from 'express';
import {
  getUserXP,
  getXpHistory,
  getAchievements,
  getSkillTree,
  updateSkillNode,
  getLeaderboard,
} from '../controllers/gamification.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/xp', getUserXP);
router.get('/xp/history', getXpHistory);
router.get('/achievements', getAchievements);
router.get('/skill-tree', getSkillTree);
router.put('/skill-tree', updateSkillNode);
router.get('/leaderboard', getLeaderboard);

export default router;
