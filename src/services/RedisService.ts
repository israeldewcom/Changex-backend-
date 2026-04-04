// ============================================
// FILE: src/services/RedisService.ts (new – complete)
// ============================================
import { RedisConnection } from '../config/redis';

export class RedisService {
  private static instance: RedisService;
  private redis = RedisConnection.getInstance().getClient();

  private constructor() {}

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) await this.redis.setex(key, ttlSeconds, stringValue);
    else await this.redis.set(key, stringValue);
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    try { return JSON.parse(data) as T; } catch { return data as unknown as T; }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async incr(key: string): Promise<number> {
    return await this.redis.incr(key);
  }

  async hset(key: string, field: string, value: any): Promise<void> {
    await this.redis.hset(key, field, JSON.stringify(value));
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const val = await this.redis.hget(key, field);
    if (!val) return null;
    return JSON.parse(val) as T;
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redis.hdel(key, field);
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    await this.redis.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    await this.redis.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redis.smembers(key);
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    const sub = RedisConnection.getInstance().getSubscriber();
    await sub.subscribe(channel);
    sub.on('message', (ch, msg) => {
      if (ch === channel) {
        try { callback(JSON.parse(msg)); } catch { callback(msg); }
      }
    });
  }
}
