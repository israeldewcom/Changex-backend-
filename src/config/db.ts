// ============================================================
// FILE: src/config/db.ts (UPDATED – with index creation)
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
    logger.info('MongoDB connected with connection pool');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// ─── CREATE NECESSARY INDEXES FOR PERFORMANCE ──────────────────────
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

    // Follows collection
    const follows = db.collection('follows');
    await follows.createIndex({ followerId: 1 });
    await follows.createIndex({ followingId: 1 });
    await follows.createIndex({ followerId: 1, followingId: 1 }, { unique: true });

    // Likes collection
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

    // Comments
    const comments = db.collection('comments');
    await comments.createIndex({ postId: 1, createdAt: -1 });
    await comments.createIndex({ parentId: 1 });

    // Courses
    const courses = db.collection('courses');
    await courses.createIndex({ isPublished: 1, approvalStatus: 1 });
    await courses.createIndex({ category: 1 });
    await courses.createIndex({ slug: 1 }, { unique: true, sparse: true });

    // Users
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ referralCode: 1 }, { unique: true });
    await users.createIndex({ seoSlug: 1 }, { unique: true, sparse: true });

    // Transactions
    const transactions = db.collection('transactions');
    await transactions.createIndex({ userId: 1, createdAt: -1 });

    logger.info('✅ MongoDB indexes ensured');
  } catch (error) {
    logger.error('Failed to create indexes:', error);
  }
};
