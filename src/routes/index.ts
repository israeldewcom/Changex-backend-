import { Router } from 'express';
import authRoutes from './auth';
import courseRoutes from './courses';
import userRoutes from './users';
import paymentRoutes from './payments';
import marketplaceRoutes from './marketplace';
import socialRoutes from './social';
import adminRoutes from './admin';
import webhookRoutes from './webhooks';
import instructorRoutes from './instructor';
import aiRoutes from './ai';
import certificateRoutes from './certificates';
import contactRoutes from './contact';
import { generalRateLimit } from '../middleware/rateLimit';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/health', (req, res) => { 
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() }); 
});

// Public routes
router.use('/v1/auth', generalRateLimit, authRoutes);
router.use('/webhooks', webhookRoutes);

// Protected routes
router.use('/v1/courses', generalRateLimit, courseRoutes);
router.use('/v1/users', generalRateLimit, userRoutes);
router.use('/v1/payments', generalRateLimit, paymentRoutes);
router.use('/v1/marketplace', generalRateLimit, marketplaceRoutes);
router.use('/v1/social', generalRateLimit, socialRoutes);
router.use('/v1/admin', generalRateLimit, adminRoutes);
router.use('/v1/instructor', generalRateLimit, instructorRoutes);
router.use('/v1/ai', authenticate, aiRoutes);
router.use('/v1/certificates', authenticate, certificateRoutes);
router.use('/v1/contact', contactRoutes);

export default router;
