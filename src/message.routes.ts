// ============================================================
// FILE: src/routes/message.routes.ts (NEW)
// ============================================================

import { Router } from 'express';
import {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
} from '../controllers/message.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

router.use(authenticate);

router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);
router.put('/messages/:id/read', markAsRead);
router.delete('/messages/:id', deleteMessage);

export default router;
