import { QueueConfig } from '../config/queue';
import { logger } from '../utils/logger';

export class QueueService {
  private static instance: QueueService;

  private constructor() {}

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async addJob(queueName: string, data: any, options?: any): Promise<any> {
    logger.info(`Job added to ${queueName}: ${JSON.stringify(data)}`);
    return null;
  }

  // Stub for processPaymentJob – no actual queue processing
}
