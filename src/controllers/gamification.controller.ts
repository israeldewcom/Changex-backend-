// ============================================================
// FILE: src/controllers/gamification.controller.ts
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import User from '../models/User.js';
import XPTransaction from '../models/XPTransaction.js';
import Achievement from '../models/Achievement.js';
import UserAchievement from '../models/UserAchievement.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

// ─── GET USER XP AND LEVEL ───────────────────────────────────────────
export const getUserXP = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const xp = user.xp || 0;
    const level = user.level || 1;
    const xpToNext = level * 1000; // XP needed for next level
    const progress = Math.min(100, Math.round((xp / xpToNext) * 100));
    res.json({
      success: true,
      data: {
        xp,
        level,
        xpToNext,
        progress,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET XP HISTORY ──────────────────────────────────────────────────
export const getXpHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const transactions = await XPTransaction.find({ userId: user._id })
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
};

// ─── GET ACHIEVEMENTS ─────────────────────────────────────────────────
export const getAchievements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const allAchievements = await Achievement.find({ isHidden: false });
    const earned = await UserAchievement.find({ userId: user._id }).select('achievementId');
    const earnedIds = earned.map(e => e.achievementId.toString());
    const enriched = allAchievements.map(a => ({
      ...a.toObject(),
      earned: earnedIds.includes(a._id.toString()),
      progress: 0, // TODO: calculate progress based on criteria
    }));
    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

// ─── GET USER SKILL TREE ─────────────────────────────────────────────
export const getSkillTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const skills = user.skillNodes || {};
    res.json({ success: true, data: skills });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE SKILL NODE ───────────────────────────────────────────────
export const updateSkillNode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { skill, value } = req.body;
    if (!skill || typeof value !== 'number') {
      return res.status(400).json({ success: false, message: 'Skill and value required' });
    }
    if (!user.skillNodes) user.skillNodes = {};
    user.skillNodes[skill] = Math.min(100, Math.max(0, value));
    await user.save();
    res.json({ success: true, data: user.skillNodes });
  } catch (err) {
    next(err);
  }
};

// ─── CHECK AND AWARD ACHIEVEMENTS (internal) ────────────────────────
// This is called from other modules when certain events occur
export const checkAchievements = async (userId: string, event: string, data?: any) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    // Fetch all achievements that match the event type
    const criteriaMap: Record<string, string> = {
      'lesson_completed': 'lessons_completed',
      'course_completed': 'courses_completed',
      'streak_update': 'streak_days',
      'xp_gained': 'xp_earned',
      'post_created': 'posts_created',
      'comment_created': 'comments_made',
      'follower_gained': 'followers_gained',
      'course_created': 'courses_created',
      'academy_created': 'academy_created',
      'revenue_earned': 'revenue_earned',
    };
    const criteriaType = criteriaMap[event];
    if (!criteriaType) return;
    // Find achievements with this criteria type that user hasn't earned
    const achievements = await Achievement.find({
      'criteria.type': criteriaType,
      isHidden: false,
    });
    const earned = await UserAchievement.find({ userId: userId }).select('achievementId');
    const earnedIds = earned.map(e => e.achievementId.toString());
    for (const achievement of achievements) {
      if (earnedIds.includes(achievement._id.toString())) continue;
      // Calculate user's current progress toward this achievement
      let current = 0;
      switch (achievement.criteria.type) {
        case 'lessons_completed':
          // Need to count completed lessons
          // Could be from LessonProgress model
          break;
        case 'courses_completed':
          // Count completed courses from Enrollment
          break;
        case 'streak_days':
          current = user.streakDays || 0;
          break;
        case 'xp_earned':
          current = user.xp || 0;
          break;
        case 'posts_created':
          // Count posts
          break;
        case 'comments_made':
          // Count comments
          break;
        case 'followers_gained':
          // Count followers
          break;
        case 'courses_created':
          // Count courses created
          break;
        case 'academy_created':
          // Count academies created
          break;
        case 'revenue_earned':
          // Sum of revenue from transactions
          break;
        default:
          continue;
      }
      if (current >= achievement.criteria.target) {
        // Award achievement
        await UserAchievement.create({
          userId: userId,
          achievementId: achievement._id,
          earnedAt: new Date(),
        });
        await Notification.create({
          userId: userId,
          title: '🏅 Achievement Unlocked!',
          message: `You earned "${achievement.name}"! ${achievement.description}`,
          type: 'gamification',
        });
        getIO().to(`user:${userId}`).emit('achievement_unlocked', {
          achievementId: achievement._id,
          name: achievement.name,
          icon: achievement.icon,
        });
      }
    }
  } catch (err) {
    console.error('Error checking achievements:', err);
  }
};

// ─── GET LEADERBOARD ─────────────────────────────────────────────────
export const getLeaderboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period = 'all' } = req.query;
    let sortField = 'xp';
    let filter = {};
    // Different periods: all, weekly, monthly
    if (period === 'weekly') {
      // Filter by XP earned in the last 7 days
    } else if (period === 'monthly') {
      // Filter by XP earned in the last 30 days
    }
    const users = await User.find(filter)
      .sort({ [sortField]: -1 })
      .limit(20)
      .select('firstName lastName xp level avatarUrl streakDays');
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};
