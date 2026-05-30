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
import User from './models/User.js';
import { authenticate, authorize } from './middlewares/auth.js';
import { getPublicAnnouncements } from './controllers/admin.controller.js';

const app = express();
const server = http.createServer(app);

// Security
app.use(helmet());

// CORS – allow any origin with credentials
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));
app.options('*', cors());
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Passport
initializePassport(app);

// Public routes (no authentication)
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.get('/api/v1/check-referral/:code', async (req, res) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code.toUpperCase() });
    res.json({ success: true, exists: !!user });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// NEW: public announcements endpoint
app.get('/api/v1/announcements/latest', getPublicAnnouncements);

// Auth & webhooks (no authentication)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/contact', contactRoutes);

// Protected routes (require authentication)
app.use('/api/v1/users', authenticate, userRoutes);
app.use('/api/v1/courses', authenticate, courseRoutes);
app.use('/api/v1/instructor', authenticate, authorize('instructor', 'admin'), instructorRoutes);
app.use('/api/v1/admin', authenticate, authorize('admin'), adminRoutes);
app.use('/api/v1/payments', authenticate, paymentRoutes);
app.use('/api/v1/affiliate', authenticate, affiliateRoutes);
app.use('/api/v1/ai', authenticate, aiRoutes);
app.use('/api/v1/feedback', authenticate, feedbackRoutes);

// Error handling
app.use(errorHandler);

// Socket.IO
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
setupSocket(io);

// Start services
async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();
    startWorkers();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await mongoose.connection.close();
    await redis.quit();
    process.exit(0);
  });
});

bootstrap();
