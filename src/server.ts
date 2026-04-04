// ============================================
// FILE: src/server.ts (unchanged + metrics)
// ============================================
import app from './app';
import { config } from './config';
import { DatabaseConnection } from './config/database';
import { RedisConnection } from './config/redis';
import { logger } from './utils/logger';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { NotificationService } from './services/NotificationService';
import client from 'prom-client';

const PORT = config.port;

async function startServer() {
  try {
    await DatabaseConnection.getInstance().connect();
    logger.info('Database connected');
    RedisConnection.getInstance();
    logger.info('Redis connected');
    const httpServer = createServer(app);
    const io = new SocketServer(httpServer, { cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true } });
    NotificationService.getInstance().setSocketServer(io);
    io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;
      if (userId) { socket.join(`user:${userId}`); logger.info(`User ${userId} connected to socket`); }
      socket.on('disconnect', () => { if (userId) { socket.leave(`user:${userId}`); logger.info(`User ${userId} disconnected from socket`); } });
    });
    if (config.env === 'production') {
      const collectDefaultMetrics = client.collectDefaultMetrics;
      collectDefaultMetrics({ prefix: 'changex_' });
      app.get('/metrics', async (req, res) => { res.set('Content-Type', client.register.contentType); res.end(await client.register.metrics()); });
    }
    httpServer.listen(PORT, () => { logger.info(`Server running on port ${PORT} in ${config.env} mode`); });
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing gracefully...');
      httpServer.close(async () => {
        await DatabaseConnection.getInstance().disconnect();
        process.exit(0);
      });
      setTimeout(() => { logger.error('Could not close connections in time, forcefully shutting down'); process.exit(1); }, 10000);
    };
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) { logger.error('Failed to start server:', error); process.exit(1); }
}

startServer();
