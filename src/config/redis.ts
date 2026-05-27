import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

export const connectRedis = async () => {
  try {
    await redis.ping();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection error:', error);
    process.exit(1);
  }
};

export default redis;
