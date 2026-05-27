import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  logger.error('REDIS_URL environment variable is missing');
  process.exit(1);
}

// ioredis v5 ESM compatibility
const RedisConstructor = (Redis as any).default || Redis;

const redis = new RedisConstructor(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 5) {
      logger.error(`Redis connection failed after ${times} retries`);
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNRESET'];
    return targetErrors.some(e => err.message.includes(e));
  },
});

redis.on('connect', () => logger.info('Redis connecting...'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err: Error) => logger.error('Redis error:', err));

export const connectRedis = async () => {
  try {
    await redis.ping();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection error:', error);
    throw error;
  }
};

export default redis;
