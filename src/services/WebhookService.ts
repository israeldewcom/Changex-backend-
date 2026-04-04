// ============================================
// FILE: src/services/WebhookService.ts (new)
// ============================================
import { PaymentService } from './PaymentService';
import { logger } from '../utils/logger';

export class WebhookService {
  private static instance: WebhookService;
  private paymentService: PaymentService;

  private constructor() { this.paymentService = PaymentService.getInstance(); }

  static getInstance(): WebhookService {
    if (!WebhookService.instance) WebhookService.instance = new WebhookService();
    return WebhookService.instance;
  }

  async handleStripeWebhook(payload: Buffer, signature: string): Promise<void> {
    await this.paymentService.processStripeWebhook(payload, signature);
  }

  async handlePaystackWebhook(body: any, signature: string): Promise<void> {
    await this.paymentService.processPaystackWebhook(body, signature);
  }
}
