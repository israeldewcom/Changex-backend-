// ============================================
// FILE: src/services/QueueService.ts (unchanged but completed)
// ============================================
import { Queue, Job } from 'bull';
import { QueueConfig } from '../config/queue';
import { logger } from '../utils/logger';
import { EmailService } from './EmailService';
import { NotificationService } from './NotificationService';
import { PaymentService } from './PaymentService';
import { AIService } from './AIService';
import { StorageService } from './StorageService';

export class QueueService {
  private static instance: QueueService;
  private queues: Map<string, Queue> = new Map();
  private emailService: EmailService;
  private notificationService: NotificationService;
  private paymentService: PaymentService;
  private aiService: AIService;
  private storageService: StorageService;

  private constructor() {
    this.emailService = EmailService.getInstance();
    this.notificationService = NotificationService.getInstance();
    this.paymentService = PaymentService.getInstance();
    this.aiService = AIService.getInstance();
    this.storageService = StorageService.getInstance();
    this.setupQueues();
  }

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  private setupQueues(): void {
    const queueConfig = QueueConfig.getInstance();
    const emailQueue = queueConfig.createQueue('email');
    emailQueue.process(async (job) => { await this.processEmailJob(job); });
    this.queues.set('email', emailQueue);
    const notificationQueue = queueConfig.createQueue('notification');
    notificationQueue.process(async (job) => { await this.processNotificationJob(job); });
    this.queues.set('notification', notificationQueue);
    const paymentQueue = queueConfig.createQueue('payment');
    paymentQueue.process(async (job) => { await this.processPaymentJob(job); });
    this.queues.set('payment', paymentQueue);
    const aiQueue = queueConfig.createQueue('ai');
    aiQueue.process(async (job) => { await this.processAIJob(job); });
    this.queues.set('ai', aiQueue);
    const imageQueue = queueConfig.createQueue('image');
    imageQueue.process(async (job) => { await this.processImageJob(job); });
    this.queues.set('image', imageQueue);
    const analyticsQueue = queueConfig.createQueue('analytics');
    analyticsQueue.process(async (job) => { await this.processAnalyticsJob(job); });
    this.queues.set('analytics', analyticsQueue);
    const withdrawalQueue = queueConfig.createQueue('withdrawal');
    withdrawalQueue.process(async (job) => { await this.processWithdrawalJob(job); });
    this.queues.set('withdrawal', withdrawalQueue);
  }

  async addJob(queueName: string, data: any, options?: any): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue ${queueName} not found`);
    return await queue.add(data, options);
  }

  private async processEmailJob(job: Job): Promise<void> {
    const { type, data } = job.data;
    switch (type) {
      case 'verification': await this.emailService.sendVerificationEmail(data.email, data.token); break;
      case 'password_reset': await this.emailService.sendPasswordResetEmail(data.email, data.token); break;
      case 'welcome': await this.emailService.sendWelcomeEmail(data.email, data.name); break;
      case 'payment_receipt': await this.emailService.sendPaymentReceipt(data.email, data.transaction); break;
      case 'course_completion': await this.emailService.sendCourseCompletionEmail(data.email, data.course); break;
      case 'withdrawal_notification': await this.emailService.sendWithdrawalNotification(data.email, data.amount, data.status); break;
      default: logger.warn(`Unknown email job type: ${type}`);
    }
  }

  private async processNotificationJob(job: Job): Promise<void> {
    const { userId, type, data } = job.data;
    await this.notificationService.sendNotification(userId, type, data);
  }

  private async processPaymentJob(job: Job): Promise<void> {
    const { type, data } = job.data;
    switch (type) {
      case 'process_withdrawal': await this.paymentService.processWithdrawal(data.userId, data.amount, data.bankDetails); break;
      case 'verify_payment': await this.paymentService.verifyPaystackPayment(data.reference); break;
      default: logger.warn(`Unknown payment job type: ${type}`);
    }
  }

  private async processAIJob(job: Job): Promise<void> {
    const { type, data } = job.data;
    switch (type) {
      case 'generate_recommendations': await this.aiService.generateRecommendations(data.userId); break;
      case 'analyze_sentiment': await this.aiService.analyzeSentiment(data.text, data.metadata); break;
      default: logger.warn(`Unknown AI job type: ${type}`);
    }
  }

  private async processImageJob(job: Job): Promise<void> {
    const { type, data } = job.data;
    switch (type) {
      case 'optimize': await this.storageService.optimizeImage(data.path, data.options); break;
      case 'upload': await this.storageService.uploadImage(data.file, data.path); break;
      default: logger.warn(`Unknown image job type: ${type}`);
    }
  }

  private async processAnalyticsJob(job: Job): Promise<void> {
    logger.info(`Processing analytics: ${job.data.type}`, { data: job.data });
  }

  private async processWithdrawalJob(job: Job): Promise<void> {
    const { transactionId, userId, amount, bankDetails } = job.data;
    try {
      const response = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'balance', amount: amount * 100, recipient: bankDetails.bankCode, reason: 'Withdrawal from ChangeX Academy' }),
      });
      const result = await response.json();
      if (result.status) {
        const email = await this.emailService.getUserEmail(userId);
        await this.addJob('email', { type: 'withdrawal_notification', data: { email, amount, status: 'completed' } });
      }
    } catch (error) {
      logger.error('Withdrawal processing failed:', error);
      throw error;
    }
  }

  async getQueueStats(queueName: string): Promise<any> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(), queue.getActiveCount(), queue.getCompletedCount(), queue.getFailedCount(), queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}
