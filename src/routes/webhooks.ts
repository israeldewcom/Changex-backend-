import { Router } from 'express';
import { WebhookController } from '../controllers/WebhookController';

const router = Router();
const webhookController = new WebhookController();

// Temporarily disable webhooks to avoid express.raw issues
// If you need them later, properly import express and use raw body parser.
router.post('/stripe', (req, res) => {
  res.status(501).json({ error: 'Stripe webhook disabled' });
});

router.post('/paystack', (req, res) => {
  res.status(501).json({ error: 'Paystack webhook disabled' });
});

export default router;
