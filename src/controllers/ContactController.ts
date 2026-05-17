import { Request, Response } from 'express';
import { EmailService } from '../services/EmailService';
import { logger } from '../utils/logger';

export class ContactController {
  private emailService: EmailService;

  constructor() {
    this.emailService = EmailService.getInstance();
  }

  submit = async (req: Request, res: Response): Promise<void> => {
    try {
      const { firstName, lastName, email, subject, message } = req.body;
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@changexacademy.com';
      const html = `
        <h3>New Contact Form Submission</h3>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `;
      await this.emailService.sendEmail(adminEmail, `Contact Form: ${subject}`, html);
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      logger.error('Contact form error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  sendFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
      const { message, email, userId, url } = req.body;
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@changexacademy.com';
      const html = `
        <h3>New Feedback</h3>
        <p><strong>User ID:</strong> ${userId || 'Guest'}</p>
        <p><strong>Email:</strong> ${email || 'Not provided'}</p>
        <p><strong>URL:</strong> ${url}</p>
        <p><strong>Message:</strong><br>${message}</p>
      `;
      await this.emailService.sendEmail(adminEmail, 'User Feedback', html);
      res.json({ success: true, message: 'Feedback sent' });
    } catch (error: any) {
      logger.error('Feedback error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
