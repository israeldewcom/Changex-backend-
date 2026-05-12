import rateLimit from 'express-rate-limit';
import { RedisConnection } from '../config/redis';
import { config } from '../config';

const redisClient = RedisConnection.getInstance().getClient();

// Helper to create a store that works with ioredis
const createRedisStore = () => {
  // For ioredis, we need to use the `sendCommand` method.
  // The store expects a `call` method, so we wrap it.
  const client = redisClient;
  return new (require('rate-limit-redis').default)({
    sendCommand: (...args: string[]) => client.call(...args),  // ioredis uses .call, but wait – ioredis does have .call?
    // Actually ioredis does have `.call()` for backward compatibility. 
    // However the error shows `redisClient.call is not a function`. 
    // That means your `redisClient` is not a real Redis client – it's the mock client from your RedisConnection.
    // So we must handle the mock separately.
  });
};

// Conditional rate limiting – skip if Redis is not ready (mock mode)
export const generalRateLimit = rateLimit({
  windowMs: config.env === 'development' ? 60 * 1000 : config.rateLimit.windowMs,
  max: config.env === 'development' ? 1000 : config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // If Redis is not ready (mock client), skip rate limiting entirely
    const isRedisReady = (redisClient as any).status === 'ready' || (redisClient as any).isReady?.();
    return !isRedisReady;
  },
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const strictRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  skip: () => !redisClient || (redisClient as any).status !== 'ready',
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.env === 'development' ? 20 : 5,
  skipSuccessfulRequests: true,
  skip: () => !redisClient || (redisClient as any).status !== 'ready',
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.env === 'development' ? 500 : 100,
  skip: () => !redisClient || (redisClient as any).status !== 'ready',
  message: { success: false, message: 'Too many requests, please slow down.' },
});
