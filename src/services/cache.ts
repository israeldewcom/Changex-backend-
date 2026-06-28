// ============================================================
// FILE: src/services/cache.ts (NEW – Redis caching service)
// ============================================================

import redis from '../config/redis.js';

const DEFAULT_TTL = 3600; // 1 hour

export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> => {
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (_) {
    // Redis error – fallback to fetch
  }

  const data = await fetchFn();

  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (_) {
    // Redis error – ignore
  }

  return data;
};

export const invalidateCache = async (pattern: string): Promise<void> => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (_) {
    // Redis error – ignore
  }
};

export const clearCacheByPrefix = async (prefix: string): Promise<void> => {
  await invalidateCache(`${prefix}:*`);
};
