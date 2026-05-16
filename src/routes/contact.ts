import { Router } from 'express';
import { ContactController } from '../controllers/ContactController';
import { authenticate } from '../middleware/auth';

const router = Router();
const contactController = new ContactController();

router.post('/', contactController.submit);                    // contact form
router.post('/feedback', authenticate, contactController.sendFeedback);  // ✅ feedback

export default router;
