// ============================================
// FILE: src/config/database.ts (unchanged)
// ============================================
import mongoose from 'mongoose';
import { config } from './index';
import { logger } from '../utils/logger';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected = false;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('Database already connected');
      return;
    }

    try {
      const uri = config.env === 'production' && config.mongodb.replicaUri 
        ? config.mongodb.replicaUri 
        : config.mongodb.uri;

      await mongoose.connect(uri, config.mongodb.options);
      
      this.isConnected = true;
      logger.info(`MongoDB connected successfully (${config.env} mode)`);

      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      process.on('SIGINT', async () => {
        await this.disconnect();
        process.exit(0);
      });
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    
    await mongoose.disconnect();
    this.isConnected = false;
    logger.info('MongoDB disconnected');
  }

  getConnection(): mongoose.Connection {
    return mongoose.connection;
  }

  isConnectedToDb(): boolean {
    return this.isConnected;
  }
}
