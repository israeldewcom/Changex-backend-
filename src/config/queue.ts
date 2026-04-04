// ============================================
// FILE: src/config/queue.ts (unchanged)
// ============================================
import Queue from 'bull';
import { RedisConnection } from './redis';
import { config } from './index';
import { logger } from '../utils/logger';

export class QueueConfig {
  private static instance: QueueConfig;
  private queues: Map<string, Queue.Queue> = new Map();

  private constructor() {}

  static getInstance(): QueueConfig {
    if (!QueueConfig.instance) {
      QueueConfig.instance = new QueueConfig();
    }
    return QueueConfig.instance;
  }

  private getRedisConfig() {
    return {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    };
  }

  createQueue(name: string): Queue.Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, this.getRedisConfig());
    
    queue.on('error', (error) => {
      logger.error(`Queue ${name} error:`, error);
    });

    queue.on('failed', (job, err) => {
      logger.error(`Queue ${name} job ${job.id} failed:`, err);
    });

    queue.on('completed', (job) => {
      logger.info(`Queue ${name} job ${job.id} completed`);
    });

    this.queues.set(name, queue);
    return queue;
  }

  getQueue(name: string): Queue.Queue | undefined {
    return this.queues.get(name);
  }

  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);
    logger.info('All queues closed');
  }
}
