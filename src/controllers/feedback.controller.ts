import { Request, Response, NextFunction } from 'express';
import Feedback from '../models/Feedback.js';

export const submitFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, email, userId, url } = req.body;
    if (!message) {
      res.status(400).json({ success: false, message: 'Message is required' });
      return;
    }
    await Feedback.create({
      message,
      email: email || undefined,
      userId: userId || undefined,
      url: url || req.headers.referer,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    next(err);
  }
};
