import { Request, Response } from 'express';
import { EmailService } from '../services/EmailService';

export class ContactController {
  submit = async (req: Request, res: Response): Promise<void> => {
    try {
      const { firstName, lastName, email, subject, message } = req.body;
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@changexacademy.com';
      const emailService = EmailService.getInstance();
      const html = `<h3>Contact from ${firstName} ${lastName} (${email})</h3><p><strong>Subject:</strong> ${subject}</p><p>${message}</p>`;
      await emailService.sendEmail(adminEmail, `Contact Form: ${subject}`, html);
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
