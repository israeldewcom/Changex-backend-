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
  try {
    await DatabaseConnection.getInstance().connect();
    logger.info('Database connected');

    RedisConnection.getInstance();
    logger.info('Redis client initialised');

    // Auto‑create admin if missing
    const ensureAdmin = async () => {
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
          logger.info('✅ Admin user created – email: admin@changexacademy.com, password: Admin@123');
        } else {
          logger.info('Admin user already exists');
        }
      } catch (err) {
        logger.error('Failed to ensure admin user:', err);
      }
    };
    await ensureAdmin();

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

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.env} mode`);
    });

    const gracefulShutdown = async () => {
      logger.info('Shutting down gracefully...');
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
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
