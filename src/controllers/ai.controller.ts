import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import { chatWithAI } from '../services/ai.js';

export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.isPremium) {
      res.status(403).json({ success: false, message: 'Premium subscription required' });
      return;
    }
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ success: false, message: 'Prompt is required' });
      return;
    }
    const response = await chatWithAI(prompt, true);
    res.json({ success: true, data: { response } });
  } catch (err) {
    next(err);
  }
};

export const uploadFileForAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.isPremium) {
      res.status(403).json({ success: false, message: 'Premium subscription required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    res.json({ success: true, message: 'File analysis placeholder - will extract text from PDF/images' });
  } catch (err) {
    next(err);
  }
};
