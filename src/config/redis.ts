// ============================================================
// FILE: src/config/redis.ts (FINAL – working with ioredis v5)
// ============================================================

import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import logger from '../utils/logger.js';

let redisInstance: RedisClient | null = null;
let isRedisAvailable = false;

export const getRedisClient = (): RedisClient | null => {
  if (isRedisAvailable === false && redisInstance === null) {
    return null;
  }

  if (redisInstance) {
    return redisInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('⚠️ REDIS_URL not set – Redis features disabled');
    isRedisAvailable = false;
    return null;
  }

  const RedisConstructor = (Redis as any).default || Redis;

  try {
    redisInstance = new RedisConstructor(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });

    redisInstance.on('connect', () => {
      isRedisAvailable = true;
      logger.info('Redis connected');
    });

    redisInstance.on('ready', () => {
      isRedisAvailable = true;
      logger.info('Redis ready');
    });

    redisInstance.on('error', (err: Error) => {
      if (isRedisAvailable !== false) {
        if (err.message.includes('ERR max number of clients')) {
          logger.warn('⚠️ Redis max clients reached – using fallback mode');
        } else {
          logger.warn('⚠️ Redis error:', err.message);
        }
      }
      isRedisAvailable = false;
    });

    return redisInstance;
  } catch (err) {
    logger.warn('⚠️ Failed to initialize Redis:', err);
    isRedisAvailable = false;
    return null;
  }
};

export const connectRedis = async (): Promise<boolean> => {
  const client = getRedisClient();
  if (!client) {
    logger.warn('⚠️ Redis not available – continuing without Redis');
    return false;
  }

  try {
    await client.ping();
    isRedisAvailable = true;
    logger.info('✅ Redis connected successfully');
    return true;
  } catch (error) {
    isRedisAvailable = false;
    logger.warn('⚠️ Redis connection failed – continuing without Redis');
    return false;
  }
};

export const isRedisReady = (): boolean => {
  return isRedisAvailable && redisInstance !== null;
};

const memoryCache = new Map<string, { data: any; expires: number }>();

export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600
): Promise<T> => {
  if (isRedisReady() && redisInstance) {
    try {
      const cached = await redisInstance.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {}
  }

  const memoryItem = memoryCache.get(key);
  if (memoryItem && memoryItem.expires > Date.now()) {
    return memoryItem.data;
  }

  const data = await fetchFn();

  memoryCache.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  });

  if (isRedisReady() && redisInstance) {
    try {
      await redisInstance.setex(key, ttl, JSON.stringify(data));
    } catch (_) {}
  }

  return data;
};

export const invalidateCache = async (pattern: string): Promise<void> => {
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern) || key === pattern) {
      memoryCache.delete(key);
    }
  }

  if (isRedisReady() && redisInstance) {
    try {
      const keys = await redisInstance.keys(pattern);
      if (keys.length > 0) {
        await redisInstance.del(keys);
      }
    } catch (_) {}
  }
};

const defaultRedis = getRedisClient();
export default defaultRedis;
