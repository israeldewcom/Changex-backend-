// File: src/workers/streakReset.worker.ts
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const runStreakResetWorker = (queue: Bull.Queue) => {
  queue.process(async () => {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await User.updateMany(
        { lastActivity: { $lt: yesterday } },
        { streakDays: 0 }
      );
      logger.info(`Streak reset for ${result.modifiedCount} users`);
    } catch (err) {
      logger.error('Streak reset failed:', err);
      throw err;
    }
  });
};
