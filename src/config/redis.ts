// ============================================================
// FILE: src/config/redis.ts (FINAL – always non‑null)
// ============================================================

import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import logger from '../utils/logger.js';

// ─── Fake Redis client (in‑memory fallback) ───────────────────
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

  async quit(): Promise<void> {
    this.store.clear();
  }

  // No‑op for event listeners
  on(event: string, handler: (...args: any[]) => void): void {
    // ignore
  }
}

// ─── Determine which client to use ────────────────────────────
let redisClient: RedisClient;

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.warn('⚠️ REDIS_URL not set – using in‑memory fallback');
  redisClient = new FakeRedis() as unknown as RedisClient;
} else {
  try {
    const RedisConstructor = (Redis as any).default || Redis;
    const client = new RedisConstructor(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });

    client.on('connect', () => {
      logger.info('Redis connected');
    });

    client.on('ready', () => {
      logger.info('Redis ready');
    });

    client.on('error', (err: Error) => {
      logger.warn(`⚠️ Redis error – switching to in‑memory fallback: ${err.message}`);
      // Switch to fake client on ANY redis error (connection resets,
      // protocol errors during reconnect, max-clients, etc.) so a
      // transient Redis hiccup never bubbles up as a raw error to users.
      redisClient = new FakeRedis() as unknown as RedisClient;
    });

    redisClient = client as RedisClient;
  } catch (err) {
    logger.warn('⚠️ Failed to initialize Redis – using in‑memory fallback');
    redisClient = new FakeRedis() as unknown as RedisClient;
  }
}

// ─── Connection test (optional) ───────────────────────────────
export const connectRedis = async (): Promise<boolean> => {
  try {
    await redisClient.ping();
    logger.info('✅ Redis connection successful');
    return true;
  } catch (error) {
    logger.warn('⚠️ Redis ping failed – using in‑memory fallback');
    // If we still have the real client, replace with fake
    if (!(redisClient instanceof FakeRedis)) {
      redisClient = new FakeRedis() as unknown as RedisClient;
    }
    return false;
  }
};

// ─── Export the singleton client (always non‑null) ──────────
export default redisClient;
