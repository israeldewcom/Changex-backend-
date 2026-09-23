// ============================================================
// FILE: src/routes/public.routes.ts
// ============================================================
// Routes intentionally exposed with NO authentication — for data that's
// safe for any visitor to see (e.g. landing page stats). Keep this file
// small and be deliberate about what gets added here: anything added to
// this router is public by definition, unlike admin.routes.ts which is
// locked behind `authenticate, authorize('admin')`.

import { Router } from 'express';
import { getPublicPlatformStats } from '../controllers/admin.controller.js';

const router = Router();

router.get('/platform-stats', getPublicPlatformStats);

export default router;
