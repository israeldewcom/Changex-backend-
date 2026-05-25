// ============================================
// FILE: src/services/AuthService.ts (Complete – with affiliate tracking on signup)
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

export class AuthService {
  private static instance: AuthService;
  private redis: RedisService;
  private emailService: EmailService;

  private constructor() {
    this.redis = RedisService.getInstance();
    this.emailService = EmailService.getInstance();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  generateTokens(userId: string): { accessToken: string; refreshToken: string } {
    const accessToken = jwt.sign({ userId }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiry });
    const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });
    return { accessToken, refreshToken };
  }

  async registerUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    referralCode?: string;
    affiliateCode?: string;
  }): Promise<IUser> {
    const session = await User.startSession();
    session.startTransaction();
    try {
      const existingUser = await User.findOne({ email: userData.email }).session(session);
      if (existingUser) throw new Error('User already exists');

      const referralCode = this.generateReferralCode();
      const user = new User({
        ...userData,
        displayName: `${userData.firstName} ${userData.lastName}`,
        referralCode,
        emailVerificationToken: crypto.randomBytes(32).toString('hex'),
      });
      await user.save({ session });

      // Process regular referral code (if provided and valid)
      if (userData.referralCode) {
        const referrer = await User.findOne({ referralCode: userData.referralCode }).session(session);
        if (referrer) {
          await this.processReferral(userData.referralCode, user._id, session);
          logger.info(`Referral code ${userData.referralCode} applied for user ${user._id}`);
        } else {
          logger.warn(`Invalid referral code provided: ${userData.referralCode} – registration continues`);
        }
      }
      
      // ✅ Process affiliate code (if provided)
      if (userData.affiliateCode) {
        const AffiliateService = require('./AffiliateService').AffiliateService;
        await AffiliateService.getInstance().registerAffiliateSignup(userData.affiliateCode, user._id.toString());
      }

      await this.emailService.sendVerificationEmail(user.email, user.emailVerificationToken!);
      await session.commitTransaction();
      return user;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async loginUser(email: string, password: string, ipAddress: string, twoFactorCode?: string): Promise<{
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
      if (!verified) throw new Error('Invalid two-factor code');
    }

    user.lastLoginAt = new Date();
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
      if (!user || !user.refreshTokens.includes(refreshToken)) throw new Error('Invalid refresh token');
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
    // Fire and forget – do NOT await
    this.emailService.sendPasswordResetEmail(email, resetToken).catch(err => logger.error(err));
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

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new Error('User not found');
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) throw new Error('Current password is incorrect');
    user.password = newPassword;
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

  private async processReferral(referralCode: string, newUserId: string, session: any): Promise<void> {
    const referrer = await User.findOne({ referralCode }).session(session);
    if (!referrer) return;
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
      type: 'referral',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await referral.save({ session });
    await User.findByIdAndUpdate(newUserId, { referredBy: referrer._id, referralLevel: level }, { session });
    await User.findByIdAndUpdate(referrer._id, { $push: { referrals: newUserId } }, { session });
  }

  private generateReferralCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
  }
}
