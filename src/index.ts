import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { initializePassport } from './config/passport.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import courseRoutes from './routes/course.routes.js';
import instructorRoutes from './routes/instructor.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import affiliateRoutes from './routes/affiliate.routes.js';
import aiRoutes from './routes/ai.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import contactRoutes from './routes/contact.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { setupSocket } from './socket.js';
import { startWorkers } from './workers/index.js';
import logger from './utils/logger.js';
import mongoose from 'mongoose';
import redis from './config/redis.js';
import { authenticate, authorize } from './middlewares/auth.js';
import Enrollment from './models/Enrollment.js';
import Referral from './models/Referral.js';
import User from './models/User.js';               // ✅ FIXED: added missing import

const app = express();
const server = http.createServer(app);

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

const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

initializePassport(app);

// Global logging
app.use((req, res, next) => {
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

app.get('/debug/version', (req, res) => {
  res.json({
    version: 'SIMPLE_PRODUCTION_2026_06_02',
    enrollmentGuard: true,
    referralDirectId: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redis.status === 'ready' ? 'connected' : 'disconnected',
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));
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
  // Placeholder – replace with actual controller if needed
  res.json({ success: true, data: [] });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/contact', contactRoutes);

app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/courses', authenticate, courseRoutes);
app.use('/api/v1/instructor', authenticate, authorize('instructor', 'admin'), instructorRoutes);
app.use('/api/v1/admin', authenticate, authorize('admin'), adminRoutes);
app.use('/api/v1/payments', authenticate, paymentRoutes);
app.use('/api/v1/affiliate', authenticate, affiliateRoutes);
app.use('/api/v1/ai', authenticate, aiRoutes);
app.use('/api/v1/feedback', authenticate, feedbackRoutes);

app.use(errorHandler);

const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
setupSocket(io);

app.use('*', (req, res) => {
  logger.warn(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Cleanup corrupted data on startup
async function cleanupCorruptedData() {
  try {
    const enrollResult = await Enrollment.deleteMany({ userId: null });
    if (enrollResult.deletedCount > 0) logger.info(`🧹 Cleaned up ${enrollResult.deletedCount} enrollment(s) with userId = null`);
    const referResult = await Referral.deleteMany({ referredId: null });
    if (referResult.deletedCount > 0) logger.info(`🧹 Cleaned up ${referResult.deletedCount} referral(s) with referredId = null`);
  } catch (err) {
    logger.error('Failed to cleanup corrupted data:', err);
  }
}

async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();
    await cleanupCorruptedData();
    startWorkers();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`✅ Debug endpoint: http://localhost:${PORT}/debug/version`);
      logger.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

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
