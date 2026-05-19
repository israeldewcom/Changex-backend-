import { Notification } from '../models/Notification';
import { RedisService } from './RedisService';
import { logger } from '../utils/logger';
import { Server as SocketServer } from 'socket.io';

export class NotificationService {
  private static instance: NotificationService;
  private redis: RedisService;
  private io: SocketServer | null = null;

  private constructor() { 
    this.redis = RedisService.getInstance(); 
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  setSocketServer(io: SocketServer): void { 
    this.io = io; 
  }

  async sendNotification(userId: string, type: string, data: { title: string; message: string; metadata?: Record<string, any> }): Promise<Notification> {
    try {
      const notification = new Notification({ 
        user: userId, 
        type, 
        title: data.title, 
        message: data.message, 
        data: data.metadata || {} 
      });
      await notification.save();
      
      if (this.io) {
        this.io.to(`user:${userId}`).emit('notification', { 
          id: notification._id, 
          type: notification.type, 
          title: notification.title, 
          message: notification.message, 
          data: notification.data, 
          createdAt: notification.createdAt 
        });
      }
      
      const cacheKey = `user:${userId}:notifications:recent`;
      const recent = await this.redis.get(cacheKey) || [];
      recent.unshift(notification);
      if (recent.length > 20) recent.pop();
      await this.redis.set(cacheKey, recent, 3600);
      
      return notification;
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  // ✅ Send bulk notifications to all users
  async sendBulkNotification(userIds: string[], type: string, data: { title: string; message: string; metadata?: Record<string, any> }): Promise<void> {
    const notifications = userIds.map(userId => ({ 
      user: userId, 
      type, 
      title: data.title, 
      message: data.message, 
      data: data.metadata || {} 
    }));
    await Notification.insertMany(notifications);
    
    if (this.io) {
      for (const userId of userIds) {
        this.io.to(`user:${userId}`).emit('notification', { 
          type, 
          title: data.title, 
          message: data.message, 
          data: data.metadata, 
          createdAt: new Date() 
        });
      }
    }
  }

  // ✅ Broadcast to all connected users (for announcements)
  async broadcastToAll(data: { title: string; message: string; type?: string; metadata?: Record<string, any> }): Promise<void> {
    if (this.io) {
      this.io.emit('announcement', {
        title: data.title,
        content: data.message,
        type: data.type || 'info',
        timestamp: new Date()
      });
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId }, 
      { isRead: true, readAt: new Date() }, 
      { new: true }
    );
    if (!notification) throw new Error('Notification not found');
  }

  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany({ user: userId, isRead: false }, { isRead: true, readAt: new Date() });
  }

  async getUserNotifications(userId: string, page: number = 1, limit: number = 20): Promise<{ notifications: Notification[]; total: number }> {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      Notification.find({ user: userId, isDeleted: false }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ user: userId, isDeleted: false })
    ]);
    return { notifications, total };
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { isDeleted: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await Notification.countDocuments({ user: userId, isRead: false, isDeleted: false });
  }

  async broadcastToRole(role: string, data: any): Promise<void> {
    if (this.io) this.io.to(`role:${role}`).emit('notification', data);
  }
}
