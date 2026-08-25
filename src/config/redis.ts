// ============================================================
// FILE: src/config/redis.ts (FIXED – Singleton with pool limit)
// ============================================================

import Redis from 'ioredis';
import logger from '../utils/logger.js';

// ─── Singleton Redis instance ──────────────────────────────
let redisInstance: Redis | null = null;
let isConnecting = false;

export const getRedisClient = (): Redis => {
  if (redisInstance) return redisInstance;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is missing');
  }

  // ioredis v5 ESM compatibility
  const RedisConstructor = (Redis as any).default || Redis;

  redisInstance = new RedisConstructor(redisUrl, {
    maxRetriesPerRequest: 1,           // fail fast instead of flooding
    enableReadyCheck: false,
    lazyConnect: true,                 // don't connect until first command
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error(`Redis connection failed after ${times} retries`);
        return null; // stop retrying
      }
      return Math.min(times * 100, 2000);
    },
    reconnectOnError: (err: Error) => {
      const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
      return targetErrors.some(e => err.message.includes(e));
    },
    // ─── Pool configuration ──────────────────────────────────
    // Limit the number of concurrent connections to Redis
    connectionLimit: 10,               // max connections in pool
    minIdleTime: 30000,               // close idle connections after 30s
  });

  // ─── Event logging (single) ───────────────────────────────
  redisInstance.on('connect', () => logger.info('Redis connecting...'));
  redisInstance.on('ready', () => logger.info('Redis ready'));
  redisInstance.on('error', (err: Error) => {
    // Only log non‑fatal errors; the retry strategy handles reconnects
    if (err.message.includes('ERR max number of clients')) {
      logger.warn('Redis client limit reached – consider increasing maxclients on server');
    } else {
      logger.error('Redis error:', err);
    }
  });

  return redisInstance;
};

// ─── Connect helper (uses singleton) ──────────────────────
export const connectRedis = async () => {
  const client = getRedisClient();
  if (isConnecting) return client;
  isConnecting = true;
  try {
    await client.ping();
    logger.info('Redis connected');
    return client;
  } catch (error) {
    logger.error('Redis connection error:', error);
    throw error;
  } finally {
    isConnecting = false;
  }
};

// ─── Export default as the singleton client ───────────────
const redis = getRedisClient();
export default redis;
