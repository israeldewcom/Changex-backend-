// ============================================
// FILE: src/routes/webhooks.ts (new)
// ============================================
import { Router } from 'express';
import { WebhookController } from '../controllers/WebhookController';

const router = Router();
const webhookController = new WebhookController();

router.post('/stripe', express.raw({ type: 'application/json' }), webhookController.stripeWebhook);
router.post('/paystack', express.json(), webhookController.paystackWebhook);

export default router;
