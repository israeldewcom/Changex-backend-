// ============================================
// FILE: src/services/AuthService.ts (Complete – transaction‑free, fixed registration)
// ============================================
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User, IUser } from '../models/User';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from './RedisService';
import { EmailService } from './EmailService';
import { AffiliateService } from './AffiliateService';

export class AuthService {
  private static instance: AuthService;
  private redis: RedisService;
  private emailService: EmailService;
  private affiliateService: AffiliateService;

  private constructor() {
    this.redis = RedisService.getInstance();
    this.emailService = EmailService.getInstance();
    this.affiliateService = AffiliateService.getInstance();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  generateTokens(userId: string): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign({ userId }, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiry,
    });
    const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiry,
    });
    return { accessToken, refreshToken };
  }

  // ============================================================
  // REGISTRATION – WITHOUT TRANSACTIONS (fixes replica set error)
  // ============================================================
  async registerUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    referralCode?: string;
  }): Promise<IUser> {
    // Check if user already exists
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) throw new Error('User already exists');

    // Generate referral code and email verification token
    const referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = new User({
      ...userData,
      displayName: `${userData.firstName} ${userData.lastName}`,
      referralCode,
      emailVerificationToken,
    });

    await user.save();

    // Process referral if code was provided (best effort, don't fail registration)
    if (userData.referralCode) {
      try {
        await this.affiliateService.processReferralSignup(userData.referralCode, user._id);
      } catch (refError) {
        logger.warn('Referral processing failed but registration continues:', refError);
      }
    }

    // Send verification email (fire and forget, don't block)
    this.emailService.sendVerificationEmail(user.email, emailVerificationToken).catch(err => {
      logger.error('Failed to send verification email:', err);
    });

    return user;
  }

  // ============================================================
  // LOGIN – with streak update
  // ============================================================
  async loginUser(
    email: string,
    password: string,
    ipAddress: string,
    twoFactorCode?: string
  ): Promise<{
    user: IUser;
    accessToken: string;
    refreshToken: string;
    requiresTwoFactor?: boolean;
  }> {
    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new Error('Invalid credentials');
    if (user.isBanned) throw new Error('Account has been banned');

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) throw new Error('Invalid credentials');

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return { user, accessToken: '', refreshToken: '', requiresTwoFactor: true };
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: twoFactorCode,
      });
      if (!verified) throw new Error('Invalid two‑factor code');
    }

    // Update last login and streak
    user.lastLoginAt = new Date();
    await user.updateStreak();  // ✅ updates streak and lastActiveAt
    await user.save();

    const { accessToken, refreshToken } = this.generateTokens(user._id.toString());
    user.refreshTokens.push(refreshToken);
    if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    await user.save();

    await this.redis.setex(`user:${user._id}:session`, 3600 * 24, refreshToken);

    return { user, accessToken, refreshToken, requiresTwoFactor: false };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as { userId: string };
      const user = await User.findById(decoded.userId);
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        throw new Error('Invalid refresh token');
      }
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      const tokens = this.generateTokens(user._id.toString());
      user.refreshTokens.push(tokens.refreshToken);
      await user.save();
      return tokens;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const user = await User.findById(userId);
    if (user) {
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      await user.save();
      await this.redis.del(`user:${userId}:session`);
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) throw new Error('Invalid verification token');
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await User.findOne({ email });
    if (!user) return;
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 3600000);
    await user.save();
    await this.emailService.sendPasswordResetEmail(email, resetToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) throw new Error('Invalid or expired reset token');
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
  }

  async enableTwoFactor(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    const secret = speakeasy.generateSecret({ length: 20, name: config.twoFactorAppName });
    user.twoFactorSecret = secret.base32;
    user.twoFactorEnabled = true;
    await user.save();
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCode };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user || !user.twoFactorSecret) throw new Error('2FA not enabled');
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
    });
    if (!verified) throw new Error('Invalid code');
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();
  }
}
