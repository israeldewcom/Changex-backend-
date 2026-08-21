// ============================================================
// FILE: src/routes/index.ts
// ============================================================

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import courseRoutes from './course.routes.js';
import instructorRoutes from './instructor.routes.js';
import adminRoutes from './admin.routes.js';
import paymentRoutes from './payment.routes.js';
import affiliateRoutes from './affiliate.routes.js';
import aiRoutes from './ai.routes.js';
import webhookRoutes from './webhook.routes.js';
import feedbackRoutes from './feedback.routes.js';
import contactRoutes from './contact.routes.js';
import postRoutes from './post.routes.js';
import followRoutes from './follow.routes.js';
import challengeRoutes from './challenge.routes.js';
import adRoutes from './ad.routes.js';
import interactiveRoutes from './interactive.routes.js';
import certificateRoutes from './certificate.routes.js';
import bookRoutes from './book.routes.js';
import articlesRoutes from './articles.routes.js';
import seoRoutes from './seo.routes.js';
import videoRoutes from './video.routes.js';
import messageRoutes from './message.routes.js';
import storyRoutes from './story.routes.js';
import groupRoutes from './group.routes.js';
import splitRoutes from './split.routes.js';
import cohortRoutes from './cohort.routes.js';
import analyticsRoutes from './analytics.routes.js';
import campaignRoutes from './campaign.routes.js';
import sponsorshipRoutes from './sponsorship.routes.js';
// NEW MODULES
import academyRoutes from './academy.routes.js';
import gamificationRoutes from './gamification.routes.js';
import liveRoutes from './live.routes.js';
import aiAdvancedRoutes from './ai-advanced.routes.js';
import offlineRoutes from './offline.routes.js';

const router = Router();

// Public routes (no auth)
router.use('/auth', authRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/contact', contactRoutes);
router.use('/seo', seoRoutes);
router.use('/books', bookRoutes);
router.use('/articles', articlesRoutes);
router.use('/courses', courseRoutes);

// Authenticated routes
router.use('/users', userRoutes);
router.use('/instructor', instructorRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/affiliate', affiliateRoutes);
router.use('/ai', aiRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/posts', postRoutes);
router.use('/follows', followRoutes);
router.use('/challenges', challengeRoutes);
router.use('/ads', adRoutes);
router.use('/interactive', interactiveRoutes);
router.use('/certificates', certificateRoutes);
router.use('/video', videoRoutes);
router.use('/messages', messageRoutes);
router.use('/stories', storyRoutes);
router.use('/groups', groupRoutes);
router.use('/splits', splitRoutes);
router.use('/cohorts', cohortRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/sponsorships', sponsorshipRoutes);

// NEW MODULE ROUTES
router.use('/academies', academyRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/live', liveRoutes);
router.use('/ai-advanced', aiAdvancedRoutes);
router.use('/offline', offlineRoutes);

export default router;
