// src/services/AnnouncementService.ts
import { Announcement } from '../models/Announcement';
import { NotificationService } from './NotificationService';
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

  async createAnnouncement(title: string, content: string, createdBy: string, type: 'info' | 'warning' | 'success' | 'danger' = 'info'): Promise<any> {
    const announcement = new Announcement({
      title,
      content,
      type,
      createdBy,
      isActive: true,
      sentToAll: false,
    });
    await announcement.save();
    return announcement;
  }

  async sendToAllUsers(announcementId: string): Promise<number> {
    const announcement = await Announcement.findById(announcementId);
    if (!announcement) throw new Error('Announcement not found');
    if (announcement.sentToAll) throw new Error('Already sent');

    const { User } = await import('../models/User');
    const users = await User.find({ isActive: true, isBanned: false }).select('_id');
    
    for (const user of users) {
      await this.notificationService.sendNotification(user._id.toString(), 'system', {
        title: `📢 ${announcement.title}`,
        message: announcement.content,
        metadata: { type: announcement.type, announcementId: announcement._id.toString() }
      });
    }

    announcement.sentToAll = true;
    announcement.sentAt = new Date();
    await announcement.save();
    
    return users.length;
  }

  async getRecentAnnouncements(limit = 20) {
    return await Announcement.find({ sentToAll: true, isActive: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('createdBy', 'firstName lastName email');
  }
}
