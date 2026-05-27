// src/controllers/contact.controller.ts
import { Request, Response, NextFunction } from 'express';
import Contact from '../models/Contact.js';
import { sendEmail } from '../services/email.js';

export const submitContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, email, subject, message } = req.body;
    await Contact.create({ firstName, lastName, email, subject, message });
    await sendEmail(process.env.ADMIN_EMAIL || 'admin@changex.com', `Contact: ${subject}`, `From: ${firstName} ${lastName} <${email}>\n\n${message}`);
    res.json({ success: true, message: 'Message sent! We will reply within 24 hours.' });
  } catch (err) { next(err); }
};
