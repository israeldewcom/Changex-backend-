// ============================================================
// FILE: src/services/cache.ts (UPDATED – scan instead of keys)
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
    let cursor = '0';
    const keysToDelete: string[] = [];
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keysToDelete.push(...result[1]);
    } while (cursor !== '0');
    if (keysToDelete.length > 0) {
      await redis.unlink(keysToDelete); // non‑blocking
    }
  } catch (_) {
    // Redis error – ignore
  }
};

export const clearCacheByPrefix = async (prefix: string): Promise<void> => {
  await invalidateCache(`${prefix}:*`);
};
