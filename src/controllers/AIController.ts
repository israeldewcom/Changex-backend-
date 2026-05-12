import { Request, Response } from 'express';
import { AIService } from '../services/AIService';

export class AIController {
  private aiService = AIService.getInstance();

  chat = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { message } = req.body;
      const messages = [{ role: 'user' as const, content: message }];
      const reply = await this.aiService.chatCompletion(userId, messages);
      res.json({ success: true, data: { reply } });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
