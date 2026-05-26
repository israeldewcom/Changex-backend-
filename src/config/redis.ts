// File: src/config/redis.ts
import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redisClient = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('Redis connected');
  } catch (error) {
    logger.error('Redis connection error:', error);
    process.exit(1);
  }
};

export { redisClient };
export default redisClient;
