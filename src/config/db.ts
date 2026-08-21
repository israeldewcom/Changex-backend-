// ============================================================
// FILE: src/config/db.ts (UPDATED - added academy indexes)
// ============================================================

import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
    });
    mongoose.set('maxTimeMS', 15000);
    logger.info('MongoDB connected with connection pool and maxTimeMS=15s');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

export const ensureIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    // Posts collection
    const posts = db.collection('posts');
    await posts.createIndex({ isPublished: 1, createdAt: -1 });
    await posts.createIndex({ authorId: 1, isPublished: 1, createdAt: -1 });
    await posts.createIndex({ tags: 1, isPublished: 1 });
    await posts.createIndex({ slug: 1 }, { unique: true });
    await posts.createIndex({ academyId: 1 });

    // Follows
    const follows = db.collection('follows');
    await follows.createIndex({ followerId: 1 });
    await follows.createIndex({ followingId: 1 });
    await follows.createIndex({ followerId: 1, followingId: 1 }, { unique: true });

    // Likes
    const likes = db.collection('likes');
    await likes.createIndex({ userId: 1, targetType: 1 });
    await likes.createIndex({ targetId: 1, targetType: 1 });

    // PostAnalytics
    const analytics = db.collection('postanalytics');
    await analytics.createIndex({ postId: 1 }, { unique: true });
    await analytics.createIndex({ totalEngagement: -1 });

    // Enrollments
    const enrollments = db.collection('enrollments');
    await enrollments.createIndex({ userId: 1, courseId: 1 }, { unique: true });
    await enrollments.createIndex({ userId: 1 });
    await enrollments.createIndex({ courseId: 1 });
    await enrollments.createIndex({ academyId: 1 });

    // Comments
    const comments = db.collection('comments');
    await comments.createIndex({ postId: 1, createdAt: -1 });
    await comments.createIndex({ parentId: 1 });
    await comments.createIndex({ academyId: 1 });

    // Courses
    const courses = db.collection('courses');
    await courses.createIndex({ isPublished: 1, approvalStatus: 1 });
    await courses.createIndex({ category: 1 });
    await courses.createIndex({ slug: 1 }, { unique: true, sparse: true });
    await courses.createIndex({ academyId: 1 });
    await courses.createIndex({ academyOnly: 1 });

    // Users
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ referralCode: 1 }, { unique: true });
    await users.createIndex({ seoSlug: 1 }, { unique: true, sparse: true });
    await users.createIndex({ academyId: 1, academyRole: 1 });

    // Transactions
    const transactions = db.collection('transactions');
    await transactions.createIndex({ userId: 1, createdAt: -1 });
    await transactions.createIndex({ academyId: 1 });

    // ─── NEW: Academy collections ──────────────────────────────────────
    const academies = db.collection('academies');
    await academies.createIndex({ slug: 1 }, { unique: true });
    await academies.createIndex({ ownerId: 1 });

    const academyMemberships = db.collection('academymemberships');
    await academyMemberships.createIndex({ academyId: 1, userId: 1 }, { unique: true });
    await academyMemberships.createIndex({ academyId: 1, role: 1 });

    const academyBranding = db.collection('academybrandings');
    await academyBranding.createIndex({ academyId: 1 }, { unique: true });

    const academyDomains = db.collection('academydomains');
    await academyDomains.createIndex({ domain: 1 }, { unique: true });
    await academyDomains.createIndex({ academyId: 1 });

    // ─── Gamification indexes ──────────────────────────────────────────
    const achievements = db.collection('achievements');
    await achievements.createIndex({ category: 1 });

    const userAchievements = db.collection('userachievements');
    await userAchievements.createIndex({ userId: 1, achievementId: 1 }, { unique: true });

    const xpTransactions = db.collection('xptransactions');
    await xpTransactions.createIndex({ userId: 1, createdAt: -1 });

    // ─── Live sessions ──────────────────────────────────────────────────
    const liveSessions = db.collection('livesessions');
    await liveSessions.createIndex({ hostId: 1, startTime: -1 });
    await liveSessions.createIndex({ status: 1 });

    // ─── Offline sync ──────────────────────────────────────────────────
    const offlineSyncs = db.collection('offlinesyncs');
    await offlineSyncs.createIndex({ userId: 1, syncedAt: -1 });

    logger.info('✅ MongoDB indexes ensured (including academy, gamification, live, offline)');
  } catch (error) {
    logger.error('Failed to create indexes:', error);
  }
};
