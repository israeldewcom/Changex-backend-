// ============================================
// FILE: src/workers/notificationWorker.ts (new)
// ============================================
import { QueueConfig } from '../config/queue';
import { NotificationService } from '../services/NotificationService';

const notificationQueue = QueueConfig.getInstance().getQueue('notification');
if (notificationQueue) {
  notificationQueue.process(async (job) => {
    const { userId, type, data } = job.data;
    const notificationService = NotificationService.getInstance();
    await notificationService.sendNotification(userId, type, data);
  });
}
