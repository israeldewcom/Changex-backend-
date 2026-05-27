// File: src/socket.ts
import logger from "./utils/logger.js";
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';
import User from './models/User.js';

let io: SocketIOServer;

export const setupSocket = (server: SocketIOServer) => {
  io = server;

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);
      if (!user) return next(new Error('User not found'));

      (socket as any).user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    socket.join(`user:${user.id}`);
    logger.info(`User ${user.id} connected`);

    socket.on('disconnect', () => {
      logger.info(`User ${user.id} disconnected`);
    });
  });
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
