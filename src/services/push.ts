// ============================================================
// FILE: src/services/push.ts (NEW)
// ============================================================

import webpush from 'web-push';
import logger from '../utils/logger.js';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    process.env.FRONTEND_URL || 'https://changex.academy',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export const sendPushNotification = async (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; data?: any }
): Promise<boolean> => {
  if (!vapidPublicKey || !vapidPrivateKey) {
    logger.warn('VAPID keys missing – push not sent');
    return false;
  }
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        icon: '/logo.png',
        badge: '/logo.png',
      })
    );
    return true;
  } catch (error) {
    logger.error('Push notification failed:', error);
    return false;
  }
};
