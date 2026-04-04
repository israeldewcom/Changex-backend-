// ============================================
// FILE: src/services/EmailService.ts (unchanged)
// ============================================
import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

export class EmailService {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter;

  private constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${config.frontendUrl}/verify-email?token=${token}`;
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6C3BFF,#00D4FF);color:white;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.button{display:inline-block;padding:12px 24px;background:#6C3BFF;color:white;text-decoration:none;border-radius:5px;margin:20px 0}.footer{text-align:center;padding:20px;font-size:12px;color:#666}</style></head><body><div class="container"><div class="header"><h1>Welcome to ChangeX Academy!</h1></div><div class="content"><h2>Verify Your Email Address</h2><p>Thank you for joining ChangeX Academy! Please verify your email address to get started.</p><a href="${verificationUrl}" class="button">Verify Email Address</a><p>Or copy this link: ${verificationUrl}</p><p>This link will expire in 24 hours.</p></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, 'Verify Your Email - ChangeX Academy', html);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6C3BFF,#00D4FF);color:white;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.button{display:inline-block;padding:12px 24px;background:#6C3BFF;color:white;text-decoration:none;border-radius:5px;margin:20px 0}.warning{color:#e74c3c;font-size:14px;margin-top:20px}</style></head><body><div class="container"><div class="header"><h1>Password Reset Request</h1></div><div class="content"><h2>Reset Your Password</h2><p>You requested to reset your password. Click the button below to create a new password.</p><a href="${resetUrl}" class="button">Reset Password</a><p>Or copy this link: ${resetUrl}</p><p class="warning">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, 'Reset Your Password - ChangeX Academy', html);
  }

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6C3BFF,#00D4FF);color:white;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.feature{margin:20px 0;padding:15px;background:white;border-radius:5px}</style></head><body><div class="container"><div class="header"><h1>Welcome to ChangeX Academy, ${name}!</h1></div><div class="content"><h2>Your Journey Starts Here</h2><p>We're excited to have you on board! Here's what you can do next:</p><div class="feature"><h3>📚 Start Learning</h3><p>Explore our library of courses and start your first lesson today.</p></div><div class="feature"><h3>💰 Earn While You Learn</h3><p>Complete lessons, refer friends, and earn real money in your wallet.</p></div><div class="feature"><h3>🏆 Join the Community</h3><p>Connect with 10,000+ learners, share your progress, and get support.</p></div><a href="${config.frontendUrl}/dashboard" class="button">Go to Dashboard</a></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, `Welcome to ChangeX Academy, ${name}!`, html);
  }

  async sendPaymentReceipt(email: string, transaction: any): Promise<void> {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6C3BFF,#00D4FF);color:white;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.receipt{background:white;padding:20px;border-radius:5px;margin:20px 0}.amount{font-size:24px;font-weight:bold;color:#6C3BFF}</style></head><body><div class="container"><div class="header"><h1>Payment Receipt</h1></div><div class="content"><h2>Thank You for Your Purchase!</h2><div class="receipt"><p><strong>Transaction ID:</strong> ${transaction.reference}</p><p><strong>Date:</strong> ${new Date(transaction.createdAt).toLocaleString()}</p><p><strong>Description:</strong> ${transaction.description}</p><p class="amount">Amount: ₦${transaction.amount.toLocaleString()}</p><p><strong>Status:</strong> ${transaction.status}</p></div><a href="${config.frontendUrl}/wallet" class="button">View Wallet</a></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, 'Your Payment Receipt - ChangeX Academy', html);
  }

  async sendCourseCompletionEmail(email: string, course: any): Promise<void> {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#00FFB2,#00D4FF);color:#07071A;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.certificate{text-align:center;margin:30px 0}</style></head><body><div class="container"><div class="header"><h1>🎉 Congratulations! 🎉</h1></div><div class="content"><h2>You've Completed ${course.title}!</h2><p>Amazing work! You've mastered ${course.title} and earned your certificate.</p><div class="certificate"><a href="${config.frontendUrl}/certificate/${course._id}" class="button">View Your Certificate</a></div><p>Share your achievement on social media and inspire others!</p></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, `Congratulations! You've Completed ${course.title}!`, html);
  }

  async sendWithdrawalNotification(email: string, amount: number, status: string): Promise<void> {
    const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#6C3BFF,#00D4FF);color:white;padding:30px;text-align:center}.content{padding:30px;background:#f9f9f9}.status{font-size:20px;font-weight:bold;margin:20px 0}</style></head><body><div class="container"><div class="header"><h1>Withdrawal ${status === 'completed' ? 'Successful' : 'Update'}</h1></div><div class="content"><h2>Your withdrawal request has been ${status}</h2><p>Amount: ₦${amount.toLocaleString()}</p><div class="status">Status: ${status.toUpperCase()}</div>${status === 'completed' ? '<p>The funds have been sent to your bank account. It may take 1-3 business days to reflect.</p>' : '<p>Please contact support if you have any questions about this withdrawal.</p>'}<a href="${config.frontendUrl}/wallet" class="button">View Wallet</a></div><div class="footer"><p>&copy; 2025 ChangeX Academy. All rights reserved.</p></div></div></body></html>`;
    await this.sendEmail(email, `Withdrawal ${status} - ChangeX Academy`, html);
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: config.email.from, to, subject, html });
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async getUserEmail(userId: string): Promise<string> {
    const { User } = require('../models/User');
    const user = await User.findById(userId);
    return user?.email || '';
  }
}
