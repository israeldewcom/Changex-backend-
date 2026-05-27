// File: src/workers/subscriptionExpiry.worker.ts
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const runSubscriptionExpiryWorker = (queue: Bull.Queue) => {
  queue.process(async () => {
    try {
      const now = new Date();
      const result = await User.updateMany(
        { isPremium: true, subscriptionExpires: { $lt: now } },
        { isPremium: false }
      );
      logger.info(`Subscription expired for ${result.modifiedCount} users`);
    } catch (err) {
      logger.error('Subscription expiry failed:', err);
      throw err;
    }
  });
};
