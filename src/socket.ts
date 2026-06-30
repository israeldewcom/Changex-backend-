// ============================================================
// FILE: src/socket.ts (UPDATED – added chat, typing, video events)
// ============================================================

import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken } from './utils/jwt.js';
import User, { IUser } from './models/User.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import Notification from './models/Notification.js';

let io: SocketIOServer;

export const setupSocket = (server: SocketIOServer) => {
  io = server;

  io.use(async (socket: Socket, next) => {
    try {
      let token = socket.handshake.auth.token;
      if (!token && socket.handshake.headers.authorization) {
        token = socket.handshake.headers.authorization.split(' ')[1];
      }
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

      // ─── Update user online status ──────────────────────────────
      User.findByIdAndUpdate(user._id, { online: true, lastSeen: new Date() }).catch(() => {});
      io.emit('user_online', { userId: user._id, online: true });

      // ─── Send Message ────────────────────────────────────────────
      socket.on('send_message', async (data) => {
        try {
          const { conversationId, content, type, fileUrl } = data;
          const message = await Message.create({
            conversationId,
            senderId: user._id,
            content,
            type: type || 'text',
            fileUrl: fileUrl || '',
            readBy: [],
          });

          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message._id,
            lastMessageAt: new Date(),
          });

          const populatedMessage = await Message.findById(message._id)
            .populate('senderId', 'firstName lastName avatarUrl');

          // Emit to all participants in the conversation
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            for (const participantId of conversation.participants) {
              if (participantId.toString() !== user._id.toString()) {
                io.to(`user:${participantId}`).emit('new_message', populatedMessage);
                // Create notification for offline users
                await Notification.create({
                  userId: participantId,
                  title: 'New Message',
                  message: `${user.firstName} ${user.lastName}: ${content.substring(0, 50)}`,
                  type: 'system',
                  data: { conversationId, messageId: message._id },
                });
              }
            }
            socket.emit('message_sent', populatedMessage);
          }
        } catch (err) {
          console.error('Send message error:', err);
        }
      });

      // ─── Typing indicator ─────────────────────────────────────────
      socket.on('typing', (data) => {
        const { conversationId, isTyping } = data;
        socket.to(`conversation:${conversationId}`).emit('typing', {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          isTyping,
        });
      });

      // ─── Mark message as read ─────────────────────────────────────
      socket.on('mark_read', async (data) => {
        try {
          const { messageId } = data;
          await Message.findByIdAndUpdate(messageId, {
            $addToSet: { readBy: user._id }
          });
        } catch (err) {
          console.error('Mark read error:', err);
        }
      });

      // ─── Join conversation room ──────────────────────────────────
      socket.on('join_conversation', (conversationId) => {
        socket.join(`conversation:${conversationId}`);
      });

      // ─── Leave conversation room ──────────────────────────────────
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conversation:${conversationId}`);
      });

      // ─── Video call events ──────────────────────────────────────
      socket.on('join_video_room', (roomId) => {
        socket.join(`video:${roomId}`);
        socket.to(`video:${roomId}`).emit('user_joined_video', { userId: user._id, name: `${user.firstName} ${user.lastName}` });
      });

      socket.on('leave_video_room', (roomId) => {
        socket.leave(`video:${roomId}`);
        socket.to(`video:${roomId}`).emit('user_left_video', { userId: user._id });
      });

      socket.on('video_signal', (data) => {
        const { roomId, signal, toUserId } = data;
        io.to(`user:${toUserId}`).emit('video_signal', { signal, fromUserId: user._id });
      });

      // ─── Disconnect ──────────────────────────────────────────────
      socket.on('disconnect', () => {
        if (user) {
          console.log(`User ${user._id} disconnected`);
          User.findByIdAndUpdate(user._id, { online: false, lastSeen: new Date() }).catch(() => {});
          io.emit('user_offline', { userId: user._id, online: false });
        }
      });
    }
  });
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
