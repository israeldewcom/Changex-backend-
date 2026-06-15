import cron from 'node-cron';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Transaction from '../models/Transaction.js';
import Challenge from '../models/Challenge.js';

// Reset daily streaks (midnight)
cron.schedule('0 0 * * *', async () => {
  try {
    const users = await User.find({ lastActivity: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    for (const user of users) {
      user.streakDays = 0;
      await user.save();
    }
    logger.info(`Streak reset completed for ${users.length} users`);
  } catch (err) {
    logger.error('Streak reset failed:', err);
  }
});

// Update leaderboard cache (every hour)
cron.schedule('0 * * * *', async () => {
  try {
    logger.info('Leaderboard cache update triggered');
    const topXP = await User.find({}).sort({ xp: -1 }).limit(100).select('firstName lastName xp level avatarUrl');
    const topEarners = await User.find({}).sort({ walletBalance: -1 }).limit(100).select('firstName lastName walletBalance level avatarUrl');
    const topStreak = await User.find({}).sort({ streakDays: -1 }).limit(100).select('firstName lastName streakDays level avatarUrl');
    
    // Store in Redis for quick access (if Redis is available)
    const redis = (await import('../config/redis.js')).default;
    if (redis.status === 'ready') {
      await redis.set('leaderboard:xp', JSON.stringify(topXP), 'EX', 3600);
      await redis.set('leaderboard:earnings', JSON.stringify(topEarners), 'EX', 3600);
      await redis.set('leaderboard:streak', JSON.stringify(topStreak), 'EX', 3600);
    }
    logger.info('Leaderboard cache updated');
  } catch (err) {
    logger.error('Leaderboard cache update failed:', err);
  }
});

// Post earnings payout (monthly on the 1st)
cron.schedule('0 0 1 * *', async () => {
  try {
    logger.info('Starting post earnings payout job...');
    const posts = await Post.find({ isMonetized: true, earnings: { $gt: 0 } });
    let totalPaid = 0;
    
    for (const post of posts) {
      const user = await User.findById(post.authorId);
      if (user) {
        const payout = post.earnings * 0.7; // 30% platform fee
        user.walletBalance = (user.walletBalance || 0) + payout;
        await user.save();
        await Transaction.create({
          userId: user._id,
          type: 'bonus',
          amount: payout,
          status: 'completed',
          description: `Post earnings for "${post.title.substring(0, 50)}"`,
          metadata: { postId: post._id, postTitle: post.title }
        });
        totalPaid += payout;
        post.earnings = 0;
        await post.save();
      }
    }
    logger.info(`Post earnings payouts completed: ₦${totalPaid.toLocaleString()} paid to ${posts.length} posts`);
  } catch (err) {
    logger.error('Post earnings payout failed:', err);
  }
});

// Check for expired premium subscriptions (daily)
cron.schedule('0 2 * * *', async () => {
  try {
    const expiredUsers = await User.find({
      isPremium: true,
      subscriptionExpires: { $lt: new Date() }
    });
    
    for (const user of expiredUsers) {
      user.isPremium = false;
      user.subscriptionExpires = undefined;
      await user.save();
      logger.info(`Premium expired for user: ${user.email}`);
    }
    logger.info(`Expired premium check completed: ${expiredUsers.length} users downgraded`);
  } catch (err) {
    logger.error('Expired premium check failed:', err);
  }
});

// Check for ended challenges and process winners (daily at midnight)
cron.schedule('0 0 * * *', async () => {
  try {
    const endedChallenges = await Challenge.find({
      isActive: true,
      endDate: { $lt: new Date() }
    });
    
    for (const challenge of endedChallenges) {
      challenge.isActive = false;
      await challenge.save();
      logger.info(`Challenge ended: ${challenge.title}`);
    }
    logger.info(`Challenge ended check completed: ${endedChallenges.length} challenges ended`);
  } catch (err) {
    logger.error('Challenge ended check failed:', err);
  }
});

// Weekly cleanup of old notifications (every Sunday at 3 AM)
cron.schedule('0 3 * * 0', async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const Notification = (await import('../models/Notification.js')).default;
    const result = await Notification.deleteMany({ createdAt: { $lt: thirtyDaysAgo }, read: true });
    logger.info(`Cleaned up ${result.deletedCount} old notifications`);
  } catch (err) {
    logger.error('Notification cleanup failed:', err);
  }
});

// Database connection health check (every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  try {
    const mongoose = await import('mongoose');
    const state = mongoose.connection.readyState;
    if (state !== 1) {
      logger.warn(`MongoDB connection state: ${state}`);
    }
  } catch (err) {
    logger.error('Health check failed:', err);
  }
});

export const startWorkers = () => {
  logger.info('Cron workers started');
  logger.info(' - Daily streak reset at midnight');
  logger.info(' - Hourly leaderboard cache update');
  logger.info(' - Monthly post earnings payout on 1st');
  logger.info(' - Daily expired premium check at 2 AM');
  logger.info(' - Daily ended challenges check at midnight');
  logger.info(' - Weekly old notification cleanup on Sunday at 3 AM');
  logger.info(' - Database health check every 5 minutes');
};
