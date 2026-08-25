// ============================================================
// FILE: src/config/redis.ts (FINAL – always returns a non‑null client)
// ============================================================

import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import logger from '../utils/logger.js';

// ─── Fallback stub – mimics Redis interface, uses memory ─────
class FakeRedis {
  private store = new Map<string, { value: string; expires: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expires && Date.now() > item.expires) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string> {
    let expires = 0;
    if (mode === 'EX' && duration) {
      expires = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expires });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.store.set(key, { value, expires: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async incr(key: string): Promise<number> {
    const val = await this.get(key);
    const num = parseInt(val || '0', 10) + 1;
    await this.set(key, String(num));
    return num;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expires = Date.now() + seconds * 1000;
    return 1;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }

  on(event: string, handler: (...args: any[]) => void): void {
    // no‑op for stub
  }

  get status(): string {
    return 'ready';
  }

  async quit(): Promise<void> {
    this.store.clear();
  }
}

let realClient: RedisClient | null = null;
let useFake = false;

export const getRedisClient = (): RedisClient => {
  if (realClient) {
    return realClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('⚠️ REDIS_URL not set – using in‑memory fallback');
    useFake = true;
    return new FakeRedis() as unknown as RedisClient;
  }

  const RedisConstructor = (Redis as any).default || Redis;

  try {
    realClient = new RedisConstructor(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: () => null, // manual retries
    });

    realClient.on('connect', () => {
      logger.info('Redis connected');
      useFake = false;
    });

    realClient.on('ready', () => {
      logger.info('Redis ready');
      useFake = false;
    });

    realClient.on('error', (err: Error) => {
      if (err.message.includes('ERR max number of clients')) {
        logger.warn('⚠️ Redis max clients reached – switching to in‑memory fallback');
      } else {
        logger.warn('⚠️ Redis error:', err.message);
      }
      // On error, switch to fake client
      if (!useFake) {
        useFake = true;
        realClient = null;
      }
    });

    return realClient;
  } catch (err) {
    logger.warn('⚠️ Failed to initialize Redis – using in‑memory fallback');
    useFake = true;
    return new FakeRedis() as unknown as RedisClient;
  }
};

// ─── Connect function – always succeeds ──────────────────────
export const connectRedis = async (): Promise<boolean> => {
  const client = getRedisClient();
  try {
    await client.ping();
    logger.info('✅ Redis connected successfully');
    return true;
  } catch (error) {
    logger.warn('⚠️ Redis ping failed – using in‑memory fallback');
    // If we already have a real client, switch to fake
    if (realClient && !useFake) {
      useFake = true;
      realClient = null;
    }
    return false;
  }
};

// ─── Cache helpers (always work, using the current client) ──
const memoryCache = new Map<string, { data: any; expires: number }>();

export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 3600
): Promise<T> => {
  const client = getRedisClient();

  // Try Redis first
  if (!useFake && realClient) {
    try {
      const cached = await client.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (_) {
      // Redis error – fallback to memory
    }
  }

  // Memory cache
  const memoryItem = memoryCache.get(key);
  if (memoryItem && memoryItem.expires > Date.now()) {
    return memoryItem.data;
  }

  // Fetch fresh
  const data = await fetchFn();

  // Store in memory
  memoryCache.set(key, {
    data,
    expires: Date.now() + ttl * 1000,
  });

  // Also store in Redis if real
  if (!useFake && realClient) {
    try {
      await client.setex(key, ttl, JSON.stringify(data));
    } catch (_) {}
  }

  return data;
};

export const invalidateCache = async (pattern: string): Promise<void> => {
  // Clear memory
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern) || key === pattern) {
      memoryCache.delete(key);
    }
  }

  // Clear Redis
  const client = getRedisClient();
  if (!useFake && realClient) {
    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (_) {}
  }
};

export const clearCacheByPrefix = async (prefix: string): Promise<void> => {
  await invalidateCache(`${prefix}:*`);
};

// ─── Export a single client instance (always non‑null) ──────
const redis = getRedisClient();
export default redis;
