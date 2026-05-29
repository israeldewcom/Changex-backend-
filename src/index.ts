import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
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
import { errorHandler } from './middlewares/errorHandler.js';
import { setupSocket } from './socket.js';
import { startWorkers } from './workers/index.js';
import logger from './utils/logger.js';
import redis from './config/redis.js';

const app = express();
const server = http.createServer(app);

// Security
app.use(helmet());
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Passport
initializePassport(app);

// Routes – order matters: auth first, then user, then courses
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/instructor', instructorRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/affiliate', affiliateRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/feedback', feedbackRoutes);

// Public check-referral endpoint
app.get('/api/v1/check-referral/:code', async (req, res) => {
  try {
    const user = await User.findOne({ referralCode: req.params.code.toUpperCase() });
    res.json({ success: true, exists: !!user, message: user ? 'Valid' : 'Not found' });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ✅ Global CastError handler for ObjectId failures
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof mongoose.Error.CastError && err.path === '_id') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }
  next(err);
});

// Final error handler
app.use(errorHandler);

// Socket.io
const io = new SocketIOServer(server, { cors: { origin: true, credentials: true } });
setupSocket(io);

// Bootstrap
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

process.on('SIGTERM', () => {
  server.close(async () => {
    await mongoose.connection.close();
    await redis.quit();
    process.exit(0);
  });
});

bootstrap();
