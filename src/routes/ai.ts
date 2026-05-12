import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AIService } from '../services/AIService';

const router = Router();
const aiService = AIService.getInstance();

router.post('/chat', authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { message, mode } = req.body;
    const messages = [{ role: 'user' as const, content: message }];
    const reply = await aiService.chatCompletion(userId, messages);
    res.json({ success: true, data: { reply } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
