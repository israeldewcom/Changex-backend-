import { Announcement } from '../models/Announcement';
import { NotificationService } from './NotificationService';
import { User } from '../models/User';
import { logger } from '../utils/logger';

export class AnnouncementService {
  private static instance: AnnouncementService;
  private notificationService: NotificationService;

  private constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  static getInstance(): AnnouncementService {
    if (!AnnouncementService.instance) {
      AnnouncementService.instance = new AnnouncementService();
    }
    return AnnouncementService.instance;
  }

  async createAnnouncement(title: string, content: string, type: 'info' | 'warning' | 'success' | 'danger', createdBy: string): Promise<Announcement> {
    const announcement = new Announcement({
      title,
      content,
      type,
      createdBy,
      sentToAll: false,
      isActive: true
    });
    await announcement.save();
    return announcement;
  }

  async sendToAllUsers(announcementId: string): Promise<void> {
    const announcement = await Announcement.findById(announcementId);
    if (!announcement) throw new Error('Announcement not found');
    
    // Get all active users
    const users = await User.find({ isActive: true, isBanned: false }).select('_id');
    const userIds = users.map(u => u._id.toString());
    
    // Send notification to each user
    for (const userId of userIds) {
      await this.notificationService.sendNotification(userId, 'system', {
        title: `📢 ${announcement.title}`,
        message: announcement.content,
        metadata: { type: announcement.type, announcementId: announcement._id }
      });
    }
    
    // Mark as sent
    announcement.sentToAll = true;
    announcement.sentAt = new Date();
    await announcement.save();
    
    // Broadcast via Socket.io to all connected users
    const io = (await import('../app')).default.get('io');
    if (io) {
      io.emit('announcement', {
        id: announcement._id,
        title: announcement.title,
        content: announcement.content,
        type: announcement.type,
        timestamp: new Date()
      });
    }
    
    logger.info(`Announcement "${announcement.title}" sent to ${userIds.length} users`);
  }

  async getActiveAnnouncements(): Promise<Announcement[]> {
    return await Announcement.find({ 
      isActive: true, 
      sentToAll: true 
    }).sort({ createdAt: -1 }).limit(5);
  }

  async getUnreadAnnouncementsForUser(userId: string): Promise<Announcement[]> {
    // Track read announcements in user's metadata or a separate collection
    // For simplicity, return recent active announcements
    return await this.getActiveAnnouncements();
  }
}
