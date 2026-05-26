// File: src/middlewares/cache.ts
import apicache from 'apicache';
import redis from '../config/redis.js';

const cache = apicache.options({
  redisClient: redis,
  statusCodes: { include: [200] },
}).middleware;

export const cacheResponse = (duration: string) => cache(duration);
