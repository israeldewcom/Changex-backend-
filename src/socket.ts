// src/socket.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';
import User, { IUser } from './models/User.js';

let io: SocketIOServer;

export const setupSocket = (server: SocketIOServer) => {
  io = server;

  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        next(new Error('Authentication required'));
        return;
      }
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.userId);
      if (!user) {
        next(new Error('User not found'));
        return;
      }
      (socket as any).user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as IUser;
    if (user) {
      socket.join(`user:${user._id}`);
      console.log(`User ${user._id} connected`);
    }
    socket.on('disconnect', () => {
      if (user) console.log(`User ${user._id} disconnected`);
    });
  });
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
