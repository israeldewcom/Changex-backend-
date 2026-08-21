// ============================================================
// FILE: src/services/notification.service.ts (UPDATED - added academy & gamification)
// ============================================================

import User, { IUser } from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendEmail } from './email.js';
import { sendSMS } from './sms.js';
import { sendPushNotification } from './push.js';
import logger from '../utils/logger.js';

type Channel = 'email' | 'sms' | 'push';

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type?: string;
  data?: any;
  channels?: Channel[];
  academyId?: string;
}

export const sendNotification = async (payload: NotificationPayload): Promise<void> => {
  const { userId, title, message, type = 'system', data, channels: requestedChannels = ['email', 'push'], academyId } = payload;

  const user = await User.findById(userId);
  if (!user) {
    logger.error(`User ${userId} not found for notification`);
    return;
  }

  const prefs = user.notificationPreferences || { email: true, sms: false, push: true };
  const channels: Channel[] = requestedChannels.filter(ch => prefs[ch as keyof typeof prefs] !== false);

  if (channels.length === 0) {
    logger.info(`No active channels for user ${userId}`);
    return;
  }

  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
    data,
    channels,
    sent: { email: false, sms: false, push: false },
    academyId: academyId || user.academyId,
  });

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      let success = false;
      switch (channel) {
        case 'email':
          if (user.email) {
            await sendEmail(user.email, title, `<h3>${title}</h3><p>${message}</p>`);
            success = true;
          }
          break;
        case 'sms':
          if (user.phone) {
            success = await sendSMS(user.phone, `${title}: ${message}`);
          }
          break;
        case 'push':
          if (user.pushSubscription) {
            success = await sendPushNotification(user.pushSubscription, { title, body: message, data });
          }
          break;
      }
      return { channel, success };
    })
  );

  const sentUpdates: any = {};
  results.forEach((result, index) => {
    const channel = channels[index];
    if (result.status === 'fulfilled' && result.value.success) {
      sentUpdates[`sent.${channel}`] = true;
    }
  });

  if (Object.keys(sentUpdates).length > 0) {
    await Notification.findByIdAndUpdate(notification._id, { $set: sentUpdates });
  }

  const io = (await import('../socket.js')).getIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification', {
      _id: notification._id,
      title,
      message,
      type,
      data,
      academyId: academyId || user.academyId,
      createdAt: notification.createdAt,
      read: false,
    });
  }
};
