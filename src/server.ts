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
    // 1. Database connection
    console.log('[1/5] Connecting to MongoDB...');
    await DatabaseConnection.getInstance().connect();
    logger.info('Database connected');
    console.log('[1/5] ✅ MongoDB connected.');

    // 2. Redis connection (non‑blocking)
    console.log('[2/5] Initialising Redis...');
    let redisAvailable = false;
    try {
      RedisConnection.getInstance();
      redisAvailable = true;
      logger.info('Redis client initialised');
      console.log('[2/5] ✅ Redis ready.');
    } catch (redisError: any) {
      logger.warn('Redis connection failed, continuing without Redis:', redisError.message);
      console.warn('[2/5] ⚠️ Redis failed, continuing without caching/queues.');
      redisAvailable = false;
    }

    // 3. Admin user creation (non‑blocking)
    console.log('[3/5] Ensuring admin user...');
    try {
      const adminExists = await User.findOne({ email: 'admin@changexacademy.com' });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('Admin@123', 12);
        await User.create({
          email: 'admin@changexacademy.com',
          password: hashedPassword,
          firstName: 'Admin',
          lastName: 'User',
          displayName: 'Admin User',
          referralCode: 'ADMIN' + Date.now(),
          roles: ['admin'],
          isApprovedInstructor: true,
          emailVerified: true,
          isActive: true,
          walletBalance: 0,
          xp: 0,
          level: 1,
          streak: 0,
          subscriptionTier: 'free',
          subscriptionStatus: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        logger.info('Admin user created');
        console.log('[3/5] ✅ Admin user created (email: admin@changexacademy.com / Admin@123).');
      } else {
        logger.info('Admin user already exists');
        console.log('[3/5] ✅ Admin user already exists.');
      }
    } catch (adminError: any) {
      logger.error('Failed to ensure admin user:', adminError.message);
      console.error('[3/5] ❌ Admin creation failed (non‑fatal):', adminError.message);
      // Do not exit – server can still run without admin seed
    }

    // 4. Create HTTP server and Socket.io
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

    // 5. Start listening
    console.log(`[5/5] Attempting to listen on port ${PORT}...`);
    httpServer.listen(PORT, () => {
      logger.info(`✅ Server running on port ${PORT} in ${config.env} mode`);
      console.log(`✅ Server successfully listening on port ${PORT}`);
    });

    httpServer.on('error', (error: any) => {
      logger.error('HTTP server error:', error);
      console.error('❌ HTTP server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        process.exit(1);
      }
    });

    // Graceful shutdown
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

// Global unhandled rejection / exception handlers
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
