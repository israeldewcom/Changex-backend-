import { Router } from 'express';
import { EmailService } from '../services/EmailService';

const router = Router();
const emailService = EmailService.getInstance();

router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, email, subject, message } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@changexacademy.com';
    const html = `<h3>Contact from ${firstName} ${lastName} (${email})</h3><p><strong>Subject:</strong> ${subject}</p><p>${message}</p>`;
    await emailService.sendEmail(adminEmail, `Contact Form: ${subject}`, html);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
