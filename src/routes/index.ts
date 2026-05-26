// ============================================
// FILE: src/routes/index.ts (Update - add affiliate routes)
// ============================================
import { Router } from 'express';
import authRoutes from './auth';
import courseRoutes from './courses';
import userRoutes from './users';
import paymentRoutes from './payments';
import marketplaceRoutes from './marketplace';
import socialRoutes from './social';
import adminRoutes from './admin';
import webhookRoutes from './webhooks';
import affiliateRoutes from './affiliate';
import referralRoutes from './referrals';
import { generalRateLimit } from '../middleware/rateLimit';

const router = Router();
router.get('/health', (req, res) => { res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() }); });
router.use('/v1/auth', generalRateLimit, authRoutes);
router.use('/v1/courses', generalRateLimit, courseRoutes);
router.use('/v1/users', generalRateLimit, userRoutes);
router.use('/v1/payments', generalRateLimit, paymentRoutes);
router.use('/v1/marketplace', generalRateLimit, marketplaceRoutes);
router.use('/v1/social', generalRateLimit, socialRoutes);
router.use('/v1/admin', generalRateLimit, adminRoutes);
router.use('/v1/affiliate', generalRateLimit, affiliateRoutes);
router.use('/v1/referrals', generalRateLimit, referralRoutes);
router.use('/webhooks', webhookRoutes);
export default router;
