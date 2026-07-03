// ============================================================
// FILE: src/workers/index.ts (updated with premium expiry cron)
// ============================================================

import cron from 'node-cron';
import logger from '../utils/logger.js';
import User from '../models/User.js';
import Challenge from '../models/Challenge.js';
import PostAnalytics from '../models/PostAnalytics.js';
import SocialEarningsConfig from '../models/SocialEarningsConfig.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

// ===== STREAK RESET =====
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

// ===== LEADERBOARD CACHE =====
cron.schedule('0 * * * *', async () => {
  logger.info('Leaderboard cache update triggered');
});

// ===== CHALLENGE STATUS UPDATER =====
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    await Challenge.updateMany(
      { status: 'upcoming', startDate: { $lte: now } },
      { status: 'active' }
    );
    await Challenge.updateMany(
      { status: 'active', endDate: { $lte: now } },
      { status: 'completed' }
    );
    logger.info('Challenge statuses updated');
  } catch (err) {
    logger.error('Challenge status update failed:', err);
  }
});

// ===== SOCIAL EARNINGS DISTRIBUTION =====
cron.schedule('0 1 * * *', async () => {
  logger.info('Starting social earnings distribution...');
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let config = await SocialEarningsConfig.findOne();
    if (!config) {
      const admin = await User.findOne({ roles: 'admin' });
      if (!admin) throw new Error('No admin found to set social earnings config');
      config = await SocialEarningsConfig.create({
        dailyPoolAmount: 10000,
        engagementWeights: { like: 1, comment: 2, share: 3, view: 0.5 },
        updatedBy: admin._id,
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (config.lastDistributionDate && config.lastDistributionDate >= today) {
      logger.info('Social earnings already distributed today');
      return;
    }

    const poolAmount = config.dailyPoolAmount || 10000;

    const analytics = await PostAnalytics.find({ totalEngagement: { $gt: 0 } })
      .populate('postId', 'authorId');

    if (analytics.length === 0) {
      logger.info('No posts with engagement to distribute.');
      config.lastDistributionDate = new Date();
      await config.save({ session });
      await session.commitTransaction();
      return;
    }

    const totalEngagement = analytics.reduce((sum, a) => sum + a.totalEngagement, 0);
    if (totalEngagement === 0) {
      config.lastDistributionDate = new Date();
      await config.save({ session });
      await session.commitTransaction();
      return;
    }

    for (const a of analytics) {
      const share = (a.totalEngagement / totalEngagement) * poolAmount;
      if (share < 0.01) continue;

      const post = a.postId as any;
      if (!post || !post.authorId) continue;

      const user = await User.findById(post.authorId);
      if (!user) continue;

      user.walletBalance = (user.walletBalance || 0) + share;
      await user.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'bonus',
        amount: share,
        status: 'completed',
        description: `Social engagement reward for post "${post.title || 'Untitled'}"`,
      }], { session });

      a.earnings = (a.earnings || 0) + share;
      await a.save({ session });
    }

    config.lastDistributionDate = new Date();
    await config.save({ session });

    await session.commitTransaction();
    logger.info(`Social earnings distribution completed: ₦${poolAmount} distributed across ${analytics.length} posts.`);
  } catch (err) {
    await session.abortTransaction();
    logger.error('Social earnings distribution failed:', err);
  } finally {
    session.endSession();
  }
});

// ===== PREMIUM EXPIRY WARNINGS & DOWNGRADE =====
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // 1. Warn users expiring in 3 days
    const expiringSoon = await User.find({
      isPremium: true,
      subscriptionExpires: { $gt: now, $lte: threeDaysFromNow },
    });
    for (const user of expiringSoon) {
      const daysLeft = Math.ceil((user.subscriptionExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      await Notification.create({
        userId: user._id,
        title: '⚠️ Premium Expiring Soon',
        message: `Your Premium subscription expires in ${daysLeft} days. Renew now to keep your benefits.`,
        type: 'system',
      });
      logger.info(`Premium warning sent to user ${user._id} (expires in ${daysLeft} days)`);
    }

    // 2. Downgrade expired users
    const expired = await User.find({
      isPremium: true,
      subscriptionExpires: { $lte: now },
    });
    for (const user of expired) {
      user.isPremium = false;
      user.tier = 'free';
      user.subscriptionExpires = undefined;
      await user.save();

      await Notification.create({
        userId: user._id,
        title: '🔓 Premium Expired',
        message: 'Your Premium subscription has expired. You have been reverted to free plan. Subscribe again to regain premium features.',
        type: 'system',
      });
      logger.info(`User ${user._id} downgraded from premium to free`);
    }
  } catch (err) {
    logger.error('Premium expiry job failed:', err);
  }
});

// ===== START WORKERS =====
export const startWorkers = () => {
  logger.info('Cron workers started');
};
