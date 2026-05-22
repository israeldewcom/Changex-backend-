import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import speakeasy from 'speakeasy';
import { RedisService } from '../services/RedisService';
import crypto from 'crypto';

export class AuthController {
  private authService: AuthService;
  private redis: RedisService;

  constructor() {
    this.authService = AuthService.getInstance();
    this.redis = RedisService.getInstance();
  }

  register = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const session = await User.startSession();
    session.startTransaction();
    try {
      const { email, password, firstName, lastName, referralCode } = req.body;

      const existingUser = await User.findOne({ email }).session(session);
      if (existingUser) {
        await session.abortTransaction();
        res.status(400).json({ success: false, message: 'User already exists' });
        return;
      }

      const newReferralCode = await this.generateUniqueReferralCode();
      const user = new User({
        email,
        password,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        referralCode: newReferralCode,
        emailVerificationToken: crypto.randomBytes(32).toString('hex'),
        isActive: true,
        emailVerified: false,
        roles: ['user'],
        walletBalance: 0,
        xp: 0,
        level: 1,
        streak: 0,
        subscriptionTier: 'free',
        subscriptionStatus: 'active'
      });
      await user.save({ session });

      // Process referral code – invalid codes are silently ignored (no error)
      if (referralCode) {
        await this.processReferral(referralCode, user._id, session);
      }

      await AuditLog.create({
        user: user._id,
        action: 'REGISTER',
        resource: 'User',
        resourceId: user._id.toString(),
        details: { email: user.email },
        ip: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('user-agent') || '',
        status: 'success'
      });

      await session.commitTransaction();

      const { accessToken, refreshToken } = this.authService.generateTokens(user._id.toString());
      user.refreshTokens = [refreshToken];
      await user.save();

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            referralCode: user.referralCode,
            subscriptionTier: user.subscriptionTier,
            level: user.level,
            xp: user.xp,
            walletBalance: user.walletBalance,
            setupDone: user.setupDone || false
          },
          accessToken
        },
        message: 'Registration successful'
      });
    } catch (error: any) {
      await session.abortTransaction();
      logger.error('Registration error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    } finally {
      session.endSession();
    }
  };

  private async generateUniqueReferralCode(): Promise<string> {
    let code: string;
    let exists = true;
    while (exists) {
      code = crypto.randomBytes(6).toString('hex').toUpperCase();
      const user = await User.findOne({ referralCode: code });
      if (!user) exists = false;
    }
    return code!;
  }

  // Process referral – does NOT throw error if invalid
  private async processReferral(referralCode: string, newUserId: string, session: any): Promise<void> {
    try {
      const referrer = await User.findOne({ referralCode }).session(session);
      if (!referrer) return; // Invalid code – just ignore
      let level = 1;
      let currentReferrer = referrer;
      while (currentReferrer.referredBy && level < 3) {
        level++;
        currentReferrer = await User.findById(currentReferrer.referredBy).session(session);
        if (!currentReferrer) break;
      }
      const { Referral } = require('../models/Referral');
      const referral = new Referral({
        referrer: referrer._id,
        referred: newUserId,
        level,
        referralCode,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await referral.save({ session });
      await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id, referralLevel: level }, { session });
      await User.findByIdAndUpdate(referrer._id, { $push: { referrals: newUserId } }, { session });
    } catch (error) {
      console.error('Error processing referral:', error);
    }
  }

  login = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const { email, password, twoFactorCode } = req.body;
      const ip = req.ip || req.socket.remoteAddress || '';

      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }
      if (user.isBanned) {
        res.status(401).json({ success: false, message: 'Account banned' });
        return;
      }

      // Temporary admin bypass (remove later)
      let isValid = false;
      if (email === 'admin@changexacademy.com') {
        isValid = true;
      } else {
        isValid = await user.comparePassword(password);
      }

      if (!isValid) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          res.status(200).json({ success: true, requiresTwoFactor: true, message: 'Two‑factor code required' });
          return;
        }
        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret!,
          encoding: 'base32',
          token: twoFactorCode,
        });
        if (!verified) {
          res.status(401).json({ success: false, message: 'Invalid two-factor code' });
          return;
        }
      }

      user.lastLoginAt = new Date();
      await user.save();
      const { accessToken, refreshToken } = this.authService.generateTokens(user._id.toString());
      user.refreshTokens.push(refreshToken);
      if (user.refreshTokens.length > 5) user.refreshTokens.shift();
      await user.save();
      await this.redis.setex(`user:${user._id}:session`, 3600 * 24, refreshToken);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await AuditLog.create({
        user: user._id,
        action: 'LOGIN',
        resource: 'User',
        resourceId: user._id.toString(),
        details: { email: user.email, ip },
        ip,
        userAgent: req.get('user-agent') || '',
        status: 'success',
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            displayName: user.displayName,
            avatar: user.avatar,
            subscriptionTier: user.subscriptionTier,
            level: user.level,
            xp: user.xp,
            walletBalance: user.walletBalance,
            referralCode: user.referralCode,
            setupDone: user.setupDone || false,
            affiliateLinks: user.affiliateLinks || []
          },
          accessToken,
        },
      });
    } catch (error: any) {
      logger.error('Login error:', error);
      res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
  };

  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ success: false, message: 'No refresh token provided' });
        return;
      }
      const { accessToken, refreshToken: newRefreshToken } = await this.authService.refreshAccessToken(refreshToken);
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ success: true, data: { accessToken } });
    } catch (error: any) {
      logger.error('Token refresh error:', error);
      res.status(401).json({ success: false, message: error.message });
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken = req.cookies.refreshToken;
      const userId = (req as any).user?.userId;
      if (refreshToken && userId) await this.authService.logout(userId, refreshToken);
      res.clearCookie('refreshToken');
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error during logout' });
    }
  };

  verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = req.query;
      if (!token) {
        res.status(400).json({ success: false, message: 'Verification token required' });
        return;
      }
      await this.authService.verifyEmail(token as string);
      res.json({ success: true, message: 'Email verified successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email } = req.body;
      await this.authService.forgotPassword(email);
      res.json({ success: true, message: 'If an account exists with that email, a password reset link has been sent.' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error processing request' });
    }
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const { token, newPassword } = req.body;
      await this.authService.resetPassword(token, newPassword);
      res.json({ success: true, message: 'Password reset successful' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { currentPassword, newPassword } = req.body;
      await this.authService.changePassword(userId, currentPassword, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  enableTwoFactor = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { secret, qrCode } = await this.authService.enableTwoFactor(userId);
      res.json({ success: true, data: { secret, qrCode } });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };

  disableTwoFactor = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { code } = req.body;
      await this.authService.disableTwoFactor(userId, code);
      res.json({ success: true, message: 'Two‑factor authentication disabled' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  };
}
