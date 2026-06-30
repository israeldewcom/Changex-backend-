// ============================================================
// FILE: src/routes/story.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  createStory,
  getStoryFeed,
  getUserStories,
  viewStory,
  reactToStory,
  saveToHighlight,
  deleteStory,
} from '../controllers/story.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.use(authenticate);

router.post('/', upload.single('media'), createStory);
router.get('/feed', getStoryFeed);
router.get('/user/:userId', getUserStories);
router.post('/:id/view', viewStory);
router.post('/:id/react', reactToStory);
router.post('/:id/highlight', saveToHighlight);
router.delete('/:id', deleteStory);

export default router;
