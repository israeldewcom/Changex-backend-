// File: src/services/email.ts
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const templateCache: Record<string, HandlebarsTemplateDelegate> = {};

async function loadTemplate(name: string) {
  if (templateCache[name]) return templateCache[name];
  const content = await fs.promises.readFile(
    path.join(__dirname, '..', 'email', 'templates', `${name}.hbs`),
    'utf-8'
  );
  templateCache[name] = handlebars.compile(content);
  return templateCache[name];
}

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}`);
  } catch (error) {
    logger.error(`Email error to ${to}:`, error);
    throw error;
  }
};

export const sendTemplatedEmail = async (
  to: string,
  subject: string,
  template: string,
  context: any
) => {
  try {
    const compiled = await loadTemplate(template);
    const html = compiled(context);
    await sendEmail(to, subject, html);
  } catch (error) {
    logger.error('Failed to send templated email', error);
    throw error;
  }
};
