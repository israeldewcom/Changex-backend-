// ============================================
// FILE: src/controllers/WebhookController.ts (new)
// ============================================
import { Request, Response } from 'express';
import { WebhookService } from '../services/WebhookService';
import { logger } from '../utils/logger';

export class WebhookController {
  private webhookService: WebhookService;
  constructor() { this.webhookService = WebhookService.getInstance(); }

  stripeWebhook = async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['stripe-signature'] as string;
    try {
      await this.webhookService.handleStripeWebhook(req.body, signature);
      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  };

  paystackWebhook = async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-paystack-signature'] as string;
    try {
      await this.webhookService.handlePaystackWebhook(req.body, signature);
      res.json({ received: true });
    } catch (error) {
      logger.error('Paystack webhook error:', error);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  };
}
