// ============================================================
// FILE: src/workers/index.ts (UPDATED - added gamification, live session jobs)
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
import Achievement from '../models/Achievement.js';
import UserAchievement from '../models/UserAchievement.js';
import LiveSession from '../models/LiveSession.js';
import Academy from '../models/Academy.js';

// ─── STREAK RESET (unchanged) ──────────────────────────────────────────
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

// ─── LEADERBOARD CACHE (unchanged) ──────────────────────────────────
cron.schedule('0 * * * *', async () => {
  logger.info('Leaderboard cache update triggered');
});

// ─── CHALLENGE STATUS UPDATER (unchanged) ────────────────────────────
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

// ─── SOCIAL EARNINGS DISTRIBUTION (unchanged) ──────────────────────
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

// ─── PREMIUM EXPIRY WARNINGS & DOWNGRADE (unchanged) ──────────────
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const expiringSoon = await User.find({
      isPremium: true,
      subscriptionExpires: { $gt: now, $lte: threeDaysFromNow },
    });
    for (const user of expiringSoon) {
      if (!user.subscriptionExpires) continue;
      const daysLeft = Math.ceil((user.subscriptionExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      await Notification.create({
        userId: user._id,
        title: '⚠️ Premium Expiring Soon',
        message: `Your Premium subscription expires in ${daysLeft} days. Renew now to keep your benefits.`,
        type: 'system',
      });
      logger.info(`Premium warning sent to user ${user._id} (expires in ${daysLeft} days)`);
    }

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

// ─── NEW: DAILY GAMIFICATION JOBS ──────────────────────────────────────
// 1. Award daily login streak bonus
cron.schedule('0 1 * * *', async () => {
  try {
    const users = await User.find({ lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    for (const user of users) {
      user.streakDays = (user.streakDays || 0) + 1;
      // Streak bonus XP (incremental)
      const bonusXP = Math.min(50, 10 + (user.streakDays * 2));
      user.xp = (user.xp || 0) + bonusXP;
      await user.save();

      // Check for streak achievements
      const streakAchievements = {
        7: '7-day Streak',
        30: '30-day Streak',
        100: '100-day Streak',
      };
      for (const [days, name] of Object.entries(streakAchievements)) {
        if (user.streakDays >= parseInt(days)) {
          const achievement = await Achievement.findOne({ name });
          if (achievement) {
            const exists = await UserAchievement.findOne({ userId: user._id, achievementId: achievement._id });
            if (!exists) {
              await UserAchievement.create({
                userId: user._id,
                achievementId: achievement._id,
                earnedAt: new Date(),
              });
              await Notification.create({
                userId: user._id,
                title: '🏅 Achievement Unlocked!',
                message: `You earned "${name}"! Keep going!`,
                type: 'gamification',
              });
            }
          }
        }
      }
    }
    logger.info('Daily streak bonus applied');
  } catch (err) {
    logger.error('Daily streak bonus failed:', err);
  }
});

// 2. Auto-complete daily challenges
cron.schedule('0 0 * * *', async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dailyChallenges = await Challenge.find({
      challengeType: 'daily',
      endDate: { $lt: new Date(), $gte: yesterday },
      status: 'active'
    });
    for (const challenge of dailyChallenges) {
      challenge.status = 'completed';
      await challenge.save();
    }
    logger.info('Daily challenges auto-completed');
  } catch (err) {
    logger.error('Daily challenges auto-complete failed:', err);
  }
});

// 3. Weekly leaderboard reset
cron.schedule('0 0 * * 0', async () => {
  try {
    // Reset weekly leaderboard cache or create new week's leaderboard
    logger.info('Weekly leaderboard reset');
  } catch (err) {
    logger.error('Weekly leaderboard reset failed:', err);
  }
});

// ─── NEW: LIVE SESSION REMINDERS ──────────────────────────────────────
cron.schedule('*/15 * * * *', async () => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
    const sessions = await LiveSession.find({
      startTime: { $gte: now, $lte: soon },
      status: 'scheduled',
      reminded: false,
    }).populate('attendees');

    for (const session of sessions) {
      for (const attendee of session.attendees) {
        await Notification.create({
          userId: attendee._id,
          title: '🔔 Live Session Starting Soon',
          message: `"${session.title}" starts in 30 minutes. Join now!`,
          type: 'system',
          data: { sessionId: session._id },
        });
      }
      session.reminded = true;
      await session.save();
      logger.info(`Live session reminders sent for ${session.title}`);
    }
  } catch (err) {
    logger.error('Live session reminders failed:', err);
  }
});

// ─── NEW: ACADEMY SUBSCRIPTION RENEWAL WARNINGS ──────────────────────
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const academies = await Academy.find({
      subscriptionEnds: { $gt: now, $lte: threeDaysLater },
    });
    for (const academy of academies) {
      const owner = await User.findById(academy.ownerId);
      if (owner) {
        await Notification.create({
          userId: owner._id,
          title: '⚠️ Academy Subscription Expiring',
          message: `Your academy "${academy.name}" subscription expires in 3 days. Renew to keep your academy active.`,
          type: 'academy',
          academyId: academy._id,
        });
      }
    }
    logger.info('Academy renewal warnings sent');
  } catch (err) {
    logger.error('Academy renewal warnings failed:', err);
  }
});

export const startWorkers = () => {
  logger.info('Cron workers started (including gamification, live sessions, academies)');
};
