// File: src/workers/leaderboard.worker.ts
import redis from '../config/redis.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

export const runLeaderboardWorker = (queue: Bull.Queue) => {
  queue.process(async () => {
    try {
      const xpLeaderboard = await User.find().sort({ xp: -1 }).limit(100).select('firstName lastName xp level').lean();
      const earningsLeaderboard = await User.find().sort({ walletBalance: -1 }).limit(100).select('firstName lastName walletBalance').lean();

      await redis.setex('leaderboard:xp', 3600, JSON.stringify(xpLeaderboard));
      await redis.setex('leaderboard:earnings', 3600, JSON.stringify(earningsLeaderboard));

      logger.info('Leaderboard cache updated');
    } catch (err) {
      logger.error('Leaderboard cache update failed:', err);
      throw err;
    }
  });
};
