import app from './app';
import { config } from './config';
import { DatabaseConnection } from './config/database';
import { RedisConnection } from './config/redis';
import { logger } from './utils/logger';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { NotificationService } from './services/NotificationService';
import { User } from './models/User';
import bcrypt from 'bcryptjs';

const PORT = config.port;

async function startServer() {
  console.log(`[START] ChangeX backend starting on port ${PORT}...`);
  
  try {
    console.log('[1/5] Connecting to MongoDB...');
    await DatabaseConnection.getInstance().connect();
    logger.info('Database connected');
    console.log('[1/5] ✅ MongoDB connected.');

    console.log('[2/5] Initialising Redis...');
    try {
      RedisConnection.getInstance();
      logger.info('Redis client initialised');
      console.log('[2/5] ✅ Redis ready.');
    } catch (redisError: any) {
      logger.warn('Redis connection failed, continuing without Redis:', redisError.message);
      console.warn('[2/5] ⚠️ Redis failed, continuing without caching/queues.');
    }

    // ============================================================
    // FORCE ADMIN CREATION – DIRECT DATABASE INSERT (bypasses model validation)
    // ============================================================
    console.log('[3/5] Ensuring admin user (Premium, unlimited access)...');
    try {
      const adminEmail = 'admin@changexacademy.com';
      const adminPassword = 'Admin@123';
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      // Delete existing admin to start fresh
      await User.deleteOne({ email: adminEmail });
      
      // Create new admin directly
      const admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        displayName: 'Admin User',
        referralCode: 'ADMIN' + Date.now(),
        roles: ['admin', 'creator', 'user'],
        isApprovedInstructor: true,
        emailVerified: true,
        isActive: true,
        walletBalance: 1000000,
        totalEarned: 0,
        totalWithdrawn: 0,
        pendingWithdrawal: 0,
        xp: 10000,
        level: 10,
        streak: 0,
        lastActiveAt: new Date(),
        badges: ['admin_badge', 'premium_badge'],
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        referredBy: null,
        referrals: [],
        referralEarnings: 0,
        referralLevel: 0,
        affiliateLinks: [],
        coursesEnrolled: [],
        coursesCompleted: [],
        lessonsCompleted: 0,
        certificatesEarned: [],
        totalSpent: 0,
        emailNotifications: true,
        twoFactorEnabled: false,
        preferredCurrency: 'NGN',
        refreshTokens: [],
        isBanned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      });
      
      console.log('[3/5] ✅ Admin user CREATED FRESH – email: admin@changexacademy.com / Admin@123 (PREMIUM)');
      logger.info('Admin user created with Premium subscription');
    } catch (adminError: any) {
      console.error('[3/5] Admin creation error:', adminError.message);
      logger.error('Admin creation error:', adminError);
    }

    console.log('[4/5] Creating HTTP server...');
    const httpServer = createServer(app);
    const io = new SocketServer(httpServer, {
      cors: { origin: true, credentials: true },
    });
    NotificationService.getInstance().setSocketServer(io);

    io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;
      if (userId) {
        socket.join(`user:${userId}`);
        logger.info(`User ${userId} connected to socket`);
      }
      socket.on('disconnect', () => {
        if (userId) {
          socket.leave(`user:${userId}`);
          logger.info(`User ${userId} disconnected from socket`);
        }
      });
    });

    console.log(`[5/5] Attempting to listen on port ${PORT}...`);
    httpServer.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT} in ${config.env} mode`);
      console.log(`✅ Server successfully listening on port ${PORT}`);
      console.log(`🔐 ADMIN LOGIN: admin@changexacademy.com / Admin@123 (PREMIUM)`);
    });

    httpServer.on('error', (error: any) => {
      logger.error('HTTP server error:', error);
      console.error('❌ HTTP server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        process.exit(1);
      }
    });

    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
      console.log('Shutting down...');
      httpServer.close(async () => {
        await DatabaseConnection.getInstance().disconnect();
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forceful shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error: any) {
    logger.error('FATAL: Failed to start server:', error);
    console.error('❌ FATAL ERROR:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();
