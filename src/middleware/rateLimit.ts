import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { RedisConnection } from '../config/redis';
import { config } from '../config';

const redisClient = RedisConnection.getInstance().getClient();

export const generalRateLimit = rateLimit({
  store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...args) }),
  windowMs: config.env === 'development' ? 60 * 1000 : config.rateLimit.windowMs,
  max: config.env === 'development' ? 1000 : config.rateLimit.max,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictRateLimit = rateLimit({
  store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...args) }),
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const authRateLimit = rateLimit({
  store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...args) }),
  windowMs: 15 * 60 * 1000,
  max: config.env === 'development' ? 20 : 5,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
});

export const apiRateLimit = rateLimit({
  store: new RedisStore({ sendCommand: (...args: string[]) => redisClient.call(...args) }),
  windowMs: 60 * 1000,
  max: config.env === 'development' ? 500 : 100,
  message: { success: false, message: 'Too many requests, please slow down.' },
});
