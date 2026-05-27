import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { paystackConfig } from '../config/paystack.js';

const router = Router();

router.post('/paystack', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = crypto.createHmac('sha512', paystackConfig.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (hash !== req.headers['x-paystack-signature']) {
      res.status(400).send('Invalid signature');
      return;
    }

    const event = req.body;
    if (event.event === 'charge.success') {
      const meta = event.data.metadata;
      if (meta.type === 'course_purchase') {
        await Enrollment.findOneAndUpdate(
          { userId: meta.userId, courseId: meta.courseId },
          {},
          { upsert: true, new: true }
        );
        await Course.findByIdAndUpdate(meta.courseId, { $inc: { totalStudents: 1 } });
      } else if (meta.type === 'subscription') {
        await User.findByIdAndUpdate(meta.userId, {
          isPremium: true,
          subscriptionExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }

      await Transaction.create({
        userId: meta.userId,
        type: meta.type,
        amount: event.data.amount / 100,
        status: 'completed',
        reference: event.data.reference,
      });
    }
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

export default router;
