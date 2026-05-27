// src/controllers/feedback.controller.ts
import { Request, Response, NextFunction } from 'express';
import Feedback from '../models/Feedback.js';

export const submitFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, email, userId, url } = req.body;
    await Feedback.create({ message, email, userId, url, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) { next(err); }
};
