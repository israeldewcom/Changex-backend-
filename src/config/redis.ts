// ============================================================
// FILE: src/config/redis.ts (FIXED – TypeScript errors resolved)
// ============================================================

import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import logger from '../utils/logger.js';

let redisInstance: RedisClient | null = null;

export const getRedisClient = (): RedisClient => {
  if (redisInstance) {
    return redisInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is missing');
  }

  redisInstance = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error(`Redis connection failed after ${times} retries`);
        return null;
      }
      return Math.min(times * 100, 2000);
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
      return targetErrors.some(e => err.message.includes(e));
    },
  });

  redisInstance.on('connect', () => logger.info('Redis connecting...'));
  redisInstance.on('ready', () => logger.info('Redis ready'));
  redisInstance.on('error', (err: Error) => {
    if (err.message.includes('ERR max number of clients')) {
      logger.warn('Redis client limit reached – consider increasing maxclients on server');
    } else {
      logger.error('Redis error:', err);
    }
  });

  return redisInstance;
};

export const connectRedis = async (): Promise<RedisClient> => {
  const client = getRedisClient();
  try {
    await client.ping();
    logger.info('Redis connected');
    return client;
  } catch (error) {
    logger.error('Redis connection error:', error);
    throw error;
  }
};

const redis = getRedisClient();
export default redis;
