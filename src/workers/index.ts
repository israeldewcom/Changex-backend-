import cron from 'node-cron';
import logger from '../utils/logger.js';
import User from '../models/User.js';

// Reset streaks daily at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const users = await User.find({ lastActivity: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    for (const user of users) {
      user.streakDays = 0;
      await user.save();
    }
    logger.info('Streak reset completed');
  } catch (err) {
    logger.error('Streak reset failed:', err);
  }
});

// Update leaderboard cache every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Leaderboard cache update triggered');
  // Optional: implement Redis caching logic here
});

export const startWorkers = () => {
  logger.info('Cron workers started');
};
