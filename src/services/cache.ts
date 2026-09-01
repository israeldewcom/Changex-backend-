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

// A hung/half-open Redis connection (e.g. lazyConnect negotiating with an
// unreachable or slow host) can leave a command's promise neither
// resolved nor rejected, so ioredis's own connectTimeout doesn't help —
// that only bounds the TCP handshake, not a stuck command. Racing every
// Redis call against a short local timeout guarantees callers always
// fall through to memory/Mongo instead of hanging the request forever.
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis call timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
};

// ─── Get cached data (tries Redis, then memory) ──────────────
export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600 // seconds
): Promise<T> => {
  // 1. Try Redis
  try {
    const cached = await withTimeout(redisClient.get(key), 2000);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    // Redis error or timeout – fall through to memory
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
    await withTimeout(redisClient.setex(key, safeTtl, JSON.stringify(data)), 2000);
  } catch (err) {
    // Redis error or timeout – ignore, we have memory fallback
    logger.debug(`Redis set error for key ${key}:`, err);
  }

  return data;
};

// ─── Invalidate cache (Redis + memory) ──────────────────────
export const invalidateCache = async (pattern: string): Promise<void> => {
  // 1. Clear memory cache
  // `pattern` may be a glob like "courses:*" (wildcard) or an exact key
  // like "course:123". `key.includes(pattern)` never matches wildcard
  // patterns because the literal "*" character never appears inside a
  // real cache key, so those entries were never being cleared. Convert
  // the glob to a regex (same approach as the FakeRedis client) so both
  // wildcard and exact patterns are honored.
  const isGlob = pattern.includes('*');
  const regex = isGlob
    ? new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
    : null;
  for (const key of memoryCache.keys()) {
    if (regex ? regex.test(key) : key === pattern) {
      memoryCache.delete(key);
    }
  }

  // 2. Clear Redis
  try {
    const keys = await withTimeout(redisClient.keys(pattern), 2000);
    if (keys.length > 0) {
      await withTimeout(redisClient.del(keys), 2000);
    }
  } catch (err) {
    // Redis error or timeout – ignore
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
    await withTimeout(redisClient.setex(key, ttl, JSON.stringify(value)), 2000);
  } catch (err) {
    logger.debug(`Redis set error for key ${key}:`, err);
  }
};

// ─── Manual cache get ────────────────────────────────────────
export const getCache = async <T>(key: string): Promise<T | null> => {
  // Redis first
  try {
    const cached = await withTimeout(redisClient.get(key), 2000);
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
    await withTimeout(redisClient.del(key), 2000);
  } catch (_) {}
};

// ─── Clear entire cache (use with caution) ──────────────────
export const clearAllCache = async (): Promise<void> => {
  memoryCache.clear();
  try {
    const keys = await withTimeout(redisClient.keys('*'), 2000);
    if (keys.length > 0) {
      await withTimeout(redisClient.del(keys), 2000);
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
