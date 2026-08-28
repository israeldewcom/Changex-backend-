// ============================================================
// FILE: src/index.ts (FIXED – ES module compatible)
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
import fs from 'fs';
import { connectDB, ensureIndexes } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { initializePassport } from './config/passport.js';

// ─── ROUTES ────────────────────────────────────────────────────────────
import routes from './routes/index.js';

// ─── MIDDLEWARE ──────────────────────────────────────────────────────
import { errorHandler } from './middlewares/errorHandler.js';
import { authenticate } from './middlewares/auth.js';

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

// ─── CONTROLLERS (for upload) ───────────────────────────────────────
import { uploadImage, uploadFile } from './controllers/admin.controller.js';

// ─── MULTER ──────────────────────────────────────────────────────────
import { upload } from './middlewares/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ─── RAW REQUEST LOGGER (debugging) ──────────────────────────────────
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url}`);
  console.log('  Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length) {
    console.log('  Body:', req.body);
  }
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    console.log('  ⚠️ Multipart request – file will be handled by multer');
  }
  next();
});

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
      paidArticles: true,
      personalizedFeed: true,
      seoFriendlyUrls: true,
      videoCalls: true,
      directMessaging: true,
      stories: true,
      studyGroups: true,
      revenueSplits: true,
      cohorts: true,
      analytics: true,
      campaigns: true,
      sponsorships: true,
      academies: true,
      gamification: true,
      liveSessions: true,
      advancedAI: true,
      offlineSupport: true,
    },
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redis && (redis as any).status === 'ready' ? 'connected' : 'disconnected',
  });
});

app.get('/debug/routes', (req, res) => {
  const routes = app._router.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => layer.route.path);
  res.json({ routes });
});

app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── JSON TEST ENDPOINT ──────────────────────────────────────────────
app.get('/api/v1/debug-json', (req, res) => {
  const testPayload = {
    success: true,
    message: 'JSON test works!',
    timestamp: new Date().toISOString(),
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(testPayload));
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

// ─── CURRENCY RATES ──────────────────────────────────────────────────
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

// ═════════════════════════════════════════════════════════════════════
// ROUTE REGISTRATION – ALL ROUTES MOUNTED UNDER /api/v1
// ═════════════════════════════════════════════════════════════════════
app.use('/api/v1', routes);

// ─── FILE UPLOAD ROUTES ──────────────────────────────────────────────
const uploadAnyHandler = (req: Request, res: Response, next: NextFunction) => {
  console.log('📥 Multer upload handler invoked');
  upload.any()(req, res, (err: any) => {
    if (err) {
      console.error('❌ Multer error:', err);
      const errorJson = JSON.stringify({ success: false, message: err.message });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(400).send(errorJson);
      return;
    }
    console.log('✅ Multer parsed files successfully');
    next();
  });
};

app.post('/api/v1/upload', authenticate, uploadAnyHandler, uploadImage);
app.post('/api/v1/upload-file', authenticate, uploadAnyHandler, uploadFile);
app.post('/api/v1/admin/upload', authenticate, uploadAnyHandler, uploadImage);
app.post('/api/v1/admin/upload-file', authenticate, uploadAnyHandler, uploadFile);

// ─── SERVE STATIC FILES ──────────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ═════════════════════════════════════════════════════════════════════
// SPA CATCH‑ALL ROUTE – MUST BE AFTER ALL API ROUTES
// ═════════════════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  // If the request is for an API route, but we haven't matched it, return 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API route not found' });
  }

  // Serve the SPA's index.html for all other GET requests
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // If index.html is missing (e.g., in development with separate frontend)
    // Redirect to the frontend URL defined in environment
    const frontendUrl = process.env.FRONTEND_URL || 'https://changex.academy';
    if (process.env.NODE_ENV === 'production') {
      // In production, we expect the file to exist, so return a clear error
      res.status(404).json({
        success: false,
        message: 'Frontend asset not found. Please check your deployment.',
      });
    } else {
      // In development, redirect to the frontend dev server
      res.redirect(frontendUrl);
    }
  }
});

// ─── ERROR HANDLER ──────────────────────────────────────────────────
app.use(errorHandler);

// ─── SOCKET.IO ───────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: true, credentials: true },
});
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
    await ensureIndexes();

    await connectRedis();
    await cleanupCorruptedData();
    startWorkers();

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`✅ Debug: http://localhost:${PORT}/debug/version`);
      logger.info(`📍 Routes: http://localhost:${PORT}/debug/routes`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📦 Features: All active`);
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
    if (redis && (redis as any).quit) {
      try { await (redis as any).quit(); } catch (_) {}
    }
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => logger.error('🔥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) => logger.error('💥 Unhandled Rejection:', reason));

bootstrap();
