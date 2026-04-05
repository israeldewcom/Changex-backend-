import { logger } from '../utils/logger';

// Mock Redis client that does nothing and never fails
class MockRedis {
  async get(key: string) { return null; }
  async set(key: string, value: any, ...args: any[]) { return 'OK'; }
  async setex(key: string, seconds: number, value: any) { return 'OK'; }
  async del(key: string) { return 1; }
  async exists(key: string) { return 0; }
  async expire(key: string, seconds: number) { return 1; }
  async incr(key: string) { return 1; }
  async hset(key: string, field: string, value: any) { return 1; }
  async hget(key: string, field: string) { return null; }
  async hdel(key: string, field: string) { return 1; }
  async sadd(key: string, ...members: string[]) { return 1; }
  async srem(key: string, ...members: string[]) { return 1; }
  async smembers(key: string) { return []; }
  async publish(channel: string, message: any) { return 1; }
  async subscribe(channel: string, callback: (msg: any) => void) { }
  on(event: string, handler: any) { }
}

export class RedisConnection {
  private static instance: RedisConnection;
  private client: any;
  private subscriber: any;

  private constructor() {
    this.client = new MockRedis();
    this.subscriber = new MockRedis();
    logger.warn('Redis is disabled – using mock client');
  }

  static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  getClient(): any { return this.client; }
  getSubscriber(): any { return this.subscriber; }
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> { }
  async get<T>(key: string): Promise<T | null> { return null; }
  async del(key: string): Promise<void> { }
  async exists(key: string): Promise<boolean> { return false; }
  async expire(key: string, seconds: number): Promise<void> { }
  async incr(key: string): Promise<number> { return 0; }
  async hset(key: string, field: string, value: any): Promise<void> { }
  async hget<T>(key: string, field: string): Promise<T | null> { return null; }
  async hdel(key: string, field: string): Promise<void> { }
  async publish(channel: string, message: any): Promise<void> { }
  async subscribe(channel: string, callback: (message: any) => void): Promise<void> { }
  async flushAll(): Promise<void> { }
  isReady(): boolean { return true; }
}
