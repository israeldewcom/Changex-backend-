// ============================================================
// FILE: src/index.ts (FULLY UPDATED – includes all routes + currency rates)
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
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { initializePassport } from './config/passport.js';

// ─── AUTH ────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';

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

// ─── SOCIAL FEATURES ────────────────────────────────────────────────
import postRoutes from './routes/post.routes.js';
import followRoutes from './routes/follow.routes.js';
import challengeRoutes from './routes/challenge.routes.js';
import adRoutes from './routes/ad.routes.js';
import interactiveRoutes from './routes/interactive.routes.js';

// ─── CERTIFICATES ────────────────────────────────────────────────────
import certificateRoutes from './routes/certificate.routes.js';

// ─── BOOKS (NEW) ────────────────────────────────────────────────────
import bookRoutes from './routes/book.routes.js';

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

const app = express();
const server = http.createServer(app);

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
app.options('*', cors());
app.use(cookieParser());

// ─── RATE LIMITING ────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use('/api/', limiter);

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

// ─── DEBUG ENDPOINTS ──────────────────────────────────────────────────
app.get('/debug/version', (req, res) => {
  res.json({
    version: 'PRODUCTION_2.1.0_BOOKS',
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

app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

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

// ─── CURRENCY RATES (added for frontend) ──────────────────────────
app.get('/api/v1/currency/rates', (req, res) => {
  // Static rates – can be updated from an external API later
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

// AUTH (public)
app.use('/api/v1/auth', authRoutes);

// WEBHOOKS (public, for Paystack)
app.use('/api/v1/webhooks', webhookRoutes);

// CONTACT (public)
app.use('/api/v1/contact', contactRoutes);

// ─── PROTECTED ROUTES ────────────────────────────────────────────────
app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/courses', authenticate, courseRoutes);
app.use('/api/v1/instructor', authenticate, authorize('instructor', 'admin'), instructorRoutes);
app.use('/api/v1/admin', authenticate, authorize('admin'), adminRoutes);
app.use('/api/v1/payments', authenticate, paymentRoutes);
app.use('/api/v1/affiliate', authenticate, affiliateRoutes);
app.use('/api/v1/ai', authenticate, aiRoutes);
app.use('/api/v1/feedback', authenticate, feedbackRoutes);

// ─── SOCIAL FEATURES ─────────────────────────────────────────────────
// Posts: public GET, but write/update require auth (handled inside)
app.use('/api/v1/posts', postRoutes);

// Follows: all require auth (handled inside)
app.use('/api/v1/follows', followRoutes);

// Challenges: public GET for active/upcoming, others auth (handled inside)
app.use('/api/v1/challenges', challengeRoutes);

// Ads: public GET for placement, admin routes require auth (handled inside)
app.use('/api/v1/ads', adRoutes);

// Interactive materials: all require auth (handled inside)
app.use('/api/v1/interactive', authenticate, interactiveRoutes);

// ─── CERTIFICATES ─────────────────────────────────────────────────────
app.use('/api/v1/certificates', authenticate, certificateRoutes);

// ─── BOOKS ──────────────────────────────────────────────────────────
// Public: list & view; download & purchase require auth (handled inside)
app.use('/api/v1/books', bookRoutes);

// ─── ERROR HANDLER & 404 ─────────────────────────────────────────────
app.use(errorHandler);

// ─── SOCKET.IO ───────────────────────────────────────────────────────
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
setupSocket(io);

// ─── CATCH‑ALL 404 ──────────────────────────────────────────────────
app.use('*', (req, res) => {
  logger.warn(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── DATA CLEANUP (startup) ──────────────────────────────────────────
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
      logger.info(`📦 Features: Posts, Follows, Challenges, Ads, Interactive, Certificates, Books, Currency`);
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
