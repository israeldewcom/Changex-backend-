// ============================================
// FILE: src/workers/index.ts (new)
// ============================================
import { QueueConfig } from '../config/queue';
import { logger } from '../utils/logger';
import './emailWorker';
import './paymentWorker';
import './analyticsWorker';
import './notificationWorker';
import './imageWorker';

logger.info('Workers started');
QueueConfig.getInstance(); // ensure queues are defined
