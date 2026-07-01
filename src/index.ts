// ============================================================
// FILE: src/index.ts – ULTIMATE FIX (all health endpoints)
// ============================================================

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { initializePassport } from './config/passport.js';

// ─── AUTH ────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';
import * as authController from './controllers/auth.controller.js';

// ─── USER & PROFILE ──────────────────────────────────────────────────
import userRoutes from './routes/user.routes.js';

// ─── COURSES ─────────────────────────────────────────────────────────
import courseRoutes from './routes/course.routes.js';
import instructorRoutes from './routes/instructor.routes.js';

// ─── ADMIN ───────────────────────────────────────────────────────────
import adminRoutes from './routes/admin.routes.js';

// ─── PAYMENTS ────────────────────────────────────────────────────────
import paymentRoutes from './routes/payment.routes.js';

// ─── AFFILIATE ───────────────────────────────────────────────────────
import affiliateRoutes from './routes/affiliate.routes.js';

// ─── AI ──────────────────────────────────────────────────────────────
import aiRoutes from './routes/ai.routes.js';

// ─── WEBHOOKS ────────────────────────────────────────────────────────
import webhookRoutes from './routes/webhook.routes.js';

// ─── FEEDBACK & CONTACT ─────────────────────────────────────────────
import feedbackRoutes from './routes/feedback.routes.js';
import contactRoutes from './routes/contact.routes.js';

// ─── SOCIAL FEATURES ─────────────────────────────────────────────────
import postRoutes from './routes/post.routes.js';
import followRoutes from './routes/follow.routes.js';
import challengeRoutes from './routes/challenge.routes.js';
import adRoutes from './routes/ad.routes.js';
import interactiveRoutes from './routes/interactive.routes.js';

// ─── CERTIFICATES ────────────────────────────────────────────────────
import certificateRoutes from './routes/certificate.routes.js';

// ─── BOOKS ──────────────────────────────────────────────────────────
import bookRoutes from './routes/book.routes.js';

// ─── SEO ─────────────────────────────────────────────────────────────
import seoRoutes from './routes/seo.routes.js';

// ─── NEW FEATURES ────────────────────────────────────────────────────
import videoRoutes from './routes/video.routes.js';
import messageRoutes from './routes/message.routes.js';
import storyRoutes from './routes/story.routes.js';
import groupRoutes from './routes/group.routes.js';
import splitRoutes from './routes/split.routes.js';
import cohortRoutes from './routes/cohort.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';

// ─── MIDDLEWARE ──────────────────────────────────────────────────────
import { errorHandler } from './middlewares/errorHandler.js';
import { authenticate, authorize } from './middlewares/auth.js';

// ─── SOCKET ──────────────────────────────────────────────────────────
import { setupSocket } from './socket.js';

// ─── WORKERS (CRON) ──────────────────────────────────────────────────
import { startWorkers } from './workers/index.js';

// ─── LOGGER ──────────────────────────────────────────────────────────
import logger from './utils/logger.js';

// ─── MONGOOSE & REDIS ────────────────────────────────────────────────
import mongoose from 'mongoose';
import redis from './config/redis.js';

// ─── MODELS (for cleanup) ───────────────────────────────────────────
import Enrollment from './models/Enrollment.js';
import Referral from './models/Referral.js';
import User from './models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
app.options('*', cors());
app.use(cookieParser());

// ─── RATE LIMITING ────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ─── COMPRESSION ──────────────────────────────────────────────────────
app.use(compression({
  threshold: 1024,
  level: 6,
}));

// ─── BODY PARSERS ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── PASSPORT ────────────────────────────────────────────────────────
initializePassport(app);

// ─── REQUEST LOGGING MIDDLEWARE ──────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const oldJson = res.json.bind(res);
  res.json = (body: any) => {
    const duration = Date.now() - start;
    logger.info(`[REQUEST] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    if (duration > 500) {
      logger.warn(`⚠️ SLOW REQUEST: ${req.method} ${req.url} - ${duration}ms`);
    }
    if (req.body && Object.keys(req.body).length) {
      const safeBody = { ...req.body };
      if (safeBody.password) safeBody.password = '***';
      logger.debug(`[REQUEST BODY]`, safeBody);
    }
    if (body && !body.success && body.message) {
      logger.warn(`[RESPONSE ERROR] ${body.message}`);
    }
    return oldJson(body);
  };
  next();
});

// ─── 🔥 ALL HEALTH / PING ROUTES (prevents offline errors) ────────
app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
app.head('/', (req, res) => res.status(200).end());
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/ping', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/status', (req, res) => res.status(200).json({ status: 'ok' }));
app.get('/api/v1/auth/register', (req, res) => res.status(200).json({ success: true }));

// ─── DEBUG ENDPOINTS ──────────────────────────────────────────────────
app.get('/debug/version', (req, res) => {
  res.json({
    version: 'PRODUCTION_3.0.0_CHANGEX',
    features: {
      enrollmentGuard: true,
      referralCaseInsensitive: true,
      affiliateTracking: true,
      manualPayments: true,
      socialPosts: true,
      challenges: true,
      ads: true,
      interactiveMaterials: true,
      certificateGeneration: true,
      booksLibrary: true,
      personalizedFeed: true,
      seoFriendlyUrls: true,
      videoCalls: true,
      directMessaging: true,
      stories: true,
      studyGroups: true,
      paidArticles: true,
      revenueSplits: true,
      cohorts: true,
      analytics: true,
    },
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redis.status === 'ready' ? 'connected' : 'disconnected',
  });
});

app.get('/debug/routes', (req, res) => {
  const routes = app._router.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => layer.route.path);
  res.json({ routes });
});

// ─── PUBLIC ENDPOINTS (no auth) ─────────────────────────────────────
app.get('/api/v1/check-referral/:code', async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const user = await User.findOne({ referralCode: { $regex: `^${code}$`, $options: 'i' }, isBanned: false });
    res.json({ success: true, exists: !!user });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

app.get('/api/v1/announcements/latest', async (req, res) => {
  try {
    const Announcement = (await import('./models/Announcement.js')).default;
    const announcements = await Announcement.find().sort('-createdAt').limit(5);
    res.json({ success: true, data: announcements });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

app.get('/api/v1/currency/rates', (req, res) => {
  res.json({
    success: true,
    data: {
      NGN: 1,
      USD: 0.00062,
      EUR: 0.00058,
      GBP: 0.0005,
    },
  });
});

// ─── ROUTE REGISTRATION ──────────────────────────────────────────────

// AUTH (all POST, OAuth, etc.)
app.use('/api/v1/auth', authRoutes);

// ─── BACKWARD‑COMPATIBLE ROUTES ──────────────────────────────────────
app.post('/api/auth/register', authController.register);
app.post('/api/register', authController.register);

// WEBHOOKS (public, for Paystack)
app.use('/api/v1/webhooks', webhookRoutes);

// CONTACT (public)
app.use('/api/v1/contact', contactRoutes);

// ─── PROTECTED ROUTES ────────────────────────────────────────────────
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructor', authenticate, authorize('instructor', 'admin'), instructorRoutes);
app.use('/api/v1/admin', authenticate, authorize('admin'), adminRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/affiliate', affiliateRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/feedback', authenticate, feedbackRoutes);

// ─── SOCIAL FEATURES ─────────────────────────────────────────────────
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/follows', followRoutes);
app.use('/api/v1/challenges', challengeRoutes);
app.use('/api/v1/ads', adRoutes);
app.use('/api/v1/interactive', authenticate, interactiveRoutes);

// ─── CERTIFICATES ─────────────────────────────────────────────────────
app.use('/api/v1/certificates', authenticate, certificateRoutes);

// ─── BOOKS ──────────────────────────────────────────────────────────
app.use('/api/v1/books', bookRoutes);

// ─── SEO ─────────────────────────────────────────────────────────────
app.use('/seo', seoRoutes);

// ─── NEW FEATURES ────────────────────────────────────────────────────
app.use('/api/v1/video', authenticate, videoRoutes);
app.use('/api/v1/messages', authenticate, messageRoutes);
app.use('/api/v1/stories', authenticate, storyRoutes);
app.use('/api/v1/groups', authenticate, groupRoutes);
app.use('/api/v1/splits', authenticate, authorize('instructor', 'admin'), splitRoutes);
app.use('/api/v1/cohorts', authenticate, authorize('instructor', 'admin'), cohortRoutes);
app.use('/api/v1/analytics', authenticate, authorize('instructor', 'admin'), analyticsRoutes);

// ─── SERVE STATIC FILES ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── CATCH‑ALL ──────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── ERROR HANDLER ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── SOCKET.IO ───────────────────────────────────────────────────────
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
setupSocket(io);

// ─── CATCH‑ALL 404 ──────────────────────────────────────────────────
app.use('*', (req, res) => {
  logger.warn(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── DATA CLEANUP ──────────────────────────────────────────────────
async function cleanupCorruptedData() {
  try {
    const enrollResult = await Enrollment.deleteMany({ userId: null });
    if (enrollResult.deletedCount > 0) {
      logger.info(`🧹 Cleaned up ${enrollResult.deletedCount} enrollment(s) with userId = null`);
    }
    const referResult = await Referral.deleteMany({ referredId: null });
    if (referResult.deletedCount > 0) {
      logger.info(`🧹 Cleaned up ${referResult.deletedCount} referral(s) with referredId = null`);
    }
  } catch (err) {
    logger.error('Failed to cleanup corrupted data:', err);
  }
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();
    await cleanupCorruptedData();
    startWorkers();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`✅ Debug: http://localhost:${PORT}/debug/version`);
      logger.info(`📍 Routes: http://localhost:${PORT}/debug/routes`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📦 Features: Posts, Follows, Challenges, Ads, Interactive, Certificates, Books, Currency, SEO, Video, DMs, Stories, Groups, Splits, Cohorts, Analytics`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await mongoose.connection.close();
    await redis.quit();
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => logger.error('🔥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) => logger.error('💥 Unhandled Rejection:', reason));

bootstrap();
