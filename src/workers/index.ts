import cron from 'node-cron';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Challenge from '../models/Challenge.js'; // ✅ Import Challenge model

// ==================== EXISTING CRON JOBS ====================
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

// ==================== EXISTING LEADERBOARD CACHE ====================
cron.schedule('0 * * * *', async () => {
  logger.info('Leaderboard cache update triggered');
});

// ==================== NEW: Challenge Status Auto-Updater ====================
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    
    // Update challenges from 'upcoming' to 'active' when startDate arrives
    await Challenge.updateMany(
      { status: 'upcoming', startDate: { $lte: now } },
      { status: 'active' }
    );
    
    // Update challenges from 'active' to 'completed' when endDate passes
    // ✅ FIXED: Use 'status' instead of 'isActive'
    await Challenge.updateMany(
      { status: 'active', endDate: { $lte: now } },
      { status: 'completed' }
    );
    
    logger.info('Challenge statuses updated');
  } catch (err) {
    logger.error('Challenge status update failed:', err);
  }
});

// ==================== START WORKERS ====================
export const startWorkers = () => {
  logger.info('Cron workers started');
};
