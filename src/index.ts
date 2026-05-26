// File: src/index.ts
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import compression from 'compression';
import { connectDB } from './config/db.js';
import { connectRedis, redisClient } from './config/redis.js';
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
import { errorHandler } from './middlewares/errorHandler.js';
import { setupSocket } from './socket.js';
import { startWorkers } from './workers/index.js';
import logger from './utils/logger.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import * as Sentry from '@sentry/node';
import { register } from 'prom-client';

export const app = express();

// Sentry must be first
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Request ID
app.use(requestIdMiddleware);

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'", "https://api.paystack.co"],
    },
  },
}));
app.use(compression());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(cookieParser());

// Rate limiting with Redis store
const limiter = rateLimit({
  store: redisClient ? new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }) : undefined,
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});
app.use('/api/', limiter);
app.use('/api/v1/auth/login', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Passport
initializePassport(app);

// Prometheus metrics endpoint
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check
app.get('/health', async (_, res) => {
  try {
    await mongoose.connection.db?.admin().ping();
    await redisClient.ping();
    res.json({ status: 'ok', db: 'connected', redis: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', redis: 'disconnected' });
  }
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructor', instructorRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/affiliate', affiliateRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Sentry error handler after routes
app.use(Sentry.Handlers.errorHandler());

// Error handling
app.use(errorHandler);

// Socket.IO server
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_URL, methods: ['GET', 'POST'] },
});
setupSocket(io);

// Start services
async function bootstrap() {
  try {
    await connectDB();
    await connectRedis();
    startWorkers(); // background jobs

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    await mongoose.connection.close();
    redisClient.quit();
    process.exit(0);
  });
});

bootstrap();
