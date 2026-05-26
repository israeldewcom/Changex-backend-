// ============================================
// FILE: src/server.ts – Forces admin creation with premium status
// ============================================
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
    // FORCE ADMIN CREATION – Premium, unlimited access, no password issues
    // ============================================================
    console.log('[3/5] Ensuring admin user (Premium, unlimited access)...');
    try {
      const adminEmail = 'admin@changexacademy.com';
      let admin = await User.findOne({ email: adminEmail });
      
      const hashedPassword = await bcrypt.hash('Admin@123', 12);
      
      if (!admin) {
        // Create new admin with premium tier
        admin = new User({
          email: adminEmail,
          password: hashedPassword,
          firstName: 'Admin',
          lastName: 'User',
          displayName: 'Admin User',
          referralCode: 'ADMIN' + Date.now(),
          roles: ['admin', 'creator'],
          isApprovedInstructor: true,
          emailVerified: true,
          isActive: true,
          walletBalance: 100000,   // Give admin some funds
          totalEarned: 0,
          totalWithdrawn: 0,
          pendingWithdrawal: 0,
          xp: 10000,
          level: 10,
          streak: 0,
          lastActiveAt: new Date(),
          badges: ['admin_badge'],
          subscriptionTier: 'premium',   // Premium subscription
          subscriptionStatus: 'active',
          subscriptionExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          referredBy: undefined,
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
          twoFactorSecret: undefined,
          preferredCurrency: 'NGN',
          refreshTokens: [],
          passwordResetToken: undefined,
          passwordResetExpires: undefined,
          emailVerificationToken: undefined,
          isBanned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: new Date(),
        });
        await admin.save();
        logger.info('✅ Admin user created with Premium subscription');
        console.log('[3/5] ✅ Admin user created (email: admin@changexacademy.com / Admin@123) – PREMIUM');
      } else {
        // Update existing admin to ensure premium status and correct password
        let needsUpdate = false;
        if (admin.subscriptionTier !== 'premium') {
          admin.subscriptionTier = 'premium';
          needsUpdate = true;
        }
        if (admin.subscriptionStatus !== 'active') {
          admin.subscriptionStatus = 'active';
          needsUpdate = true;
        }
        if (!admin.subscriptionExpiresAt || admin.subscriptionExpiresAt < new Date()) {
          admin.subscriptionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          needsUpdate = true;
        }
        if (!admin.roles.includes('admin')) {
          admin.roles.push('admin');
          needsUpdate = true;
        }
        if (!admin.roles.includes('creator')) {
          admin.roles.push('creator');
          needsUpdate = true;
        }
        if (admin.isApprovedInstructor !== true) {
          admin.isApprovedInstructor = true;
          needsUpdate = true;
        }
        // Force password reset (re-hash) to ensure it works
        admin.password = hashedPassword;
        needsUpdate = true;
        
        if (needsUpdate) {
          await admin.save();
          logger.info('✅ Admin user updated to Premium with correct password');
          console.log('[3/5] ✅ Existing admin updated – now Premium, password reset to Admin@123');
        } else {
          logger.info('Admin user already Premium and active');
          console.log('[3/5] ✅ Admin user already Premium.');
        }
      }
    } catch (adminError: any) {
      logger.error('Failed to ensure admin user:', adminError.message);
      console.error('[3/5] ❌ Admin creation/update failed:', adminError.message);
      // Do not exit – server can still run
    }

    console.log('[4/5] Creating HTTP server...');
    const httpServer = createServer(app);
    const io = new SocketServer(httpServer, {
      cors: { origin: config.frontendUrl || 'http://localhost:3000', credentials: true },
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
      console.log(`🔐 Admin login: admin@changexacademy.com / Admin@123 (PREMIUM)`);
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
