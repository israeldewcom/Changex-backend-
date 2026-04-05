import { logger } from '../utils/logger';

export class QueueConfig {
  private static instance: QueueConfig;
  private constructor() {}

  static getInstance(): QueueConfig {
    if (!QueueConfig.instance) {
      QueueConfig.instance = new QueueConfig();
    }
    return QueueConfig.instance;
  }

  createQueue(name: string): any {
    logger.warn(`Queue ${name} disabled – no Redis`);
    return { add: async () => {}, process: () => {}, on: () => {} };
  }

  getQueue(name: string): any { return null; }
  async closeAll(): Promise<void> { }
}
