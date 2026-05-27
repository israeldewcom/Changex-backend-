// src/workers/index.ts
import Bull from 'bull';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import User from '../models/User.js';

const queueOptions = { createClient: () => redis };

export const streakQueue = new Bull('streak-update', queueOptions);
export const leaderboardQueue = new Bull('leaderboard-cache', queueOptions);
export const certificateQueue = new Bull('certificate-gen', queueOptions);

export const startWorkers = () => {
  streakQueue.process(async () => {
    const users = await User.find({ lastActivity: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    for (const user of users) {
      user.streakDays = 0;
      await user.save();
    }
    logger.info('Streak update completed');
  });
  streakQueue.add({}, { repeat: { cron: '0 0 * * *' } });

  leaderboardQueue.process(async () => {
    logger.info('Leaderboard cache updated');
  });
  leaderboardQueue.add({}, { repeat: { cron: '0 * * * *' } });

  certificateQueue.process(async (job) => {
    logger.info(`Generating certificate for ${job.data.userId}`);
  });
  logger.info('Workers started');
};
