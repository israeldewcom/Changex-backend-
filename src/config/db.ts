// ============================================================
// FILE: src/config/db.ts (UPDATED – connection pooling)
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
