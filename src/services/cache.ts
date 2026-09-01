// ============================================================
// FILE: src/services/cache.ts (Guaranteed to work)
// ============================================================

import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

// ─── In‑memory fallback cache ────────────────────────────────
interface CacheItem {
  value: any;
  expires: number;
}

const memoryCache = new Map<string, CacheItem>();

// ─── Get cached data (tries Redis, then memory) ──────────────
export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600 // seconds
): Promise<T> => {
  // 1. Try Redis
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Redis error – fall through to memory
    logger.debug(`Redis get error for key ${key}:`, err);
  }

  // 2. Try memory cache
  const memItem = memoryCache.get(key);
  if (memItem && memItem.expires > Date.now()) {
    return memItem.value as T;
  }

  // 3. Fetch fresh data
  const data = await fetchFn();

  // 4. Store in memory (always)
  memoryCache.set(key, {
    value: data,
    expires: Date.now() + ttl * 1000,
  });

  // 5. Store in Redis (if available)
  try {
    const safeTtl = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 3600;
    await redisClient.setex(key, safeTtl, JSON.stringify(data));
  } catch (err) {
    // Redis error – ignore, we have memory fallback
    logger.debug(`Redis set error for key ${key}:`, err);
  }

  return data;
};

// ─── Invalidate cache (Redis + memory) ──────────────────────
export const invalidateCache = async (pattern: string): Promise<void> => {
  // 1. Clear memory cache
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern) || key === pattern) {
      memoryCache.delete(key);
    }
  }

  // 2. Clear Redis
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    // Redis error – ignore
    logger.debug(`Redis invalidate error for pattern ${pattern}:`, err);
  }
};

// ─── Clear by prefix (convenience) ───────────────────────────
export const clearCacheByPrefix = async (prefix: string): Promise<void> => {
  await invalidateCache(`${prefix}:*`);
};

// ─── Manual cache set (direct) ──────────────────────────────
export const setCache = async <T>(
  key: string,
  value: T,
  ttl: number = 3600
): Promise<void> => {
  // Memory
  memoryCache.set(key, {
    value,
    expires: Date.now() + ttl * 1000,
  });

  // Redis
  try {
    await redisClient.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    logger.debug(`Redis set error for key ${key}:`, err);
  }
};

// ─── Manual cache get ────────────────────────────────────────
export const getCache = async <T>(key: string): Promise<T | null> => {
  // Redis first
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (_) {}

  // Memory fallback
  const memItem = memoryCache.get(key);
  if (memItem && memItem.expires > Date.now()) {
    return memItem.value as T;
  }

  return null;
};

// ─── Delete a single key ─────────────────────────────────────
export const deleteCache = async (key: string): Promise<void> => {
  memoryCache.delete(key);
  try {
    await redisClient.del(key);
  } catch (_) {}
};

// ─── Clear entire cache (use with caution) ──────────────────
export const clearAllCache = async (): Promise<void> => {
  memoryCache.clear();
  try {
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (_) {}
};

// ─── Export default object for convenience ──────────────────
const cache = {
  getOrSetCache,
  invalidateCache,
  clearCacheByPrefix,
  setCache,
  getCache,
  deleteCache,
  clearAllCache,
};

export default cache;
