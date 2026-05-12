import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { config } from '../config';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/EmailService';

export class AuthController {
  /**
   * POST /api/v1/auth/register
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { firstName, lastName, email, password, phone, referralCode } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({ success: false, message: 'Email already registered' });
        return;
      }

      // Handle referral
      let referredBy = null;
      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer) {
          referredBy = referrer._id;
        }
      }

      // Create user (password hashed by pre-save hook)
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phone,
        displayName: `${firstName} ${lastName}`,
        referredBy,
        referralCode: await this.generateUniqueReferralCode(),
        roles: ['user'],
      });

      await user.save();

      // Update referrer's referrals list
      if (referredBy) {
        await User.findByIdAndUpdate(referredBy, {
          $push: { referrals: user._id },
        });
      }

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token in user document
      user.refreshTokens.push(refreshToken);
      await user.save();

      const userData = this.sanitizeUser(user);

      res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
        user: userData,
      });
    } catch (error) {
      logger.error('Register error:', error);
      res.status(500).json({ success: false, message: 'Registration failed' });
    }
  };

  /**
   * POST /api/v1/auth/login
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        res.status(401).json({ success: false, message: 'Invalid email or password' });
        return;
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        res.status(401).json({ success: false, message: 'Invalid email or password' });
        return;
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      // Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token
      user.refreshTokens.push(refreshToken);
      await user.save();

      const userData = this.sanitizeUser(user);

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: userData,
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ success: false, message: 'Login failed' });
    }
  };

  /**
   * POST /api/v1/auth/refresh-token
   */
  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        res.status(400).json({ success: false, message: 'Refresh token is required' });
        return;
      }

      // Verify token
      let decoded: any;
      try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid refresh token' });
        return;
      }

      const user = await User.findById(decoded.userId);
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        res.status(401).json({ success: false, message: 'Token not recognized' });
        return;
      }

      // Rotate refresh token
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);

      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      user.refreshTokens.push(newRefreshToken);
      await user.save();

      res.json({
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(500).json({ success: false, message: 'Token refresh failed' });
    }
  };

  /**
   * POST /api/v1/auth/logout
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      // Remove the refresh token from the user's document if present
      if (refreshToken && (req as any).user) {
        await User.findByIdAndUpdate((req as any).user.userId, {
          $pull: { refreshTokens: refreshToken },
        });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ success: false, message: 'Logout failed' });
    }
  };

  /**
   * POST /api/v1/auth/forgot-password
   */
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) {
        // For security, don't reveal if email exists
        res.json({ success: true, message: 'If the email exists, a reset link has been sent' });
        return;
      }

      // Generate reset token
      const resetToken = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '1h' });
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = new Date(Date.now() + 3600000);
      await user.save();

      // Send email (implement your email service)
      const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        html: `Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.`,
      });

      res.json({ success: true, message: 'Password reset link sent to email' });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Failed to send reset email' });
    }
  };

  /**
   * POST /api/v1/auth/reset-password
   */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, newPassword } = req.body;
      let decoded: any;
      try {
        decoded = jwt.verify(token, config.jwt.accessSecret);
      } catch (err) {
        res.status(400).json({ success: false, message: 'Invalid or expired token' });
        return;
      }

      const user = await User.findOne({
        _id: decoded.userId,
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() },
      });

      if (!user) {
        res.status(400).json({ success: false, message: 'Invalid or expired token' });
        return;
      }

      user.password = newPassword; // pre-save hook will hash
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({ success: false, message: 'Password reset failed' });
    }
  };

  /**
   * GET /api/v1/auth/google
   * Initiates Google OAuth (frontend redirects here)
   */
  googleAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // This is handled by Passport.js or custom OAuth flow.
    // For simplicity, we assume a callback is handled elsewhere.
    // In a real implementation, you'd redirect to Google's consent screen.
    res.redirect(`${config.googleAuthUrl}`);
  };

  /**
   * GET /api/v1/auth/google/callback
   * Handles Google OAuth callback
   */
  googleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // User data from Google (handled by Passport)
      const profile = (req as any).user;
      if (!profile) {
        res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
        return;
      }

      let user = await User.findOne({ email: profile.email });
      if (!user) {
        // Create new user
        user = new User({
          firstName: profile.givenName,
          lastName: profile.familyName,
          email: profile.email,
          displayName: profile.displayName,
          avatar: profile.picture,
          referralCode: await this.generateUniqueReferralCode(),
          roles: ['user'],
        });
        await user.save();
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);
      user.refreshTokens.push(refreshToken);
      await user.save();

      res.redirect(`${config.frontendUrl}?token=${accessToken}&refreshToken=${refreshToken}`);
    } catch (error) {
      logger.error('Google callback error:', error);
      res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }
  };

  /**
   * GET /api/v1/auth/github
   */
  githubAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.redirect(`${config.githubAuthUrl}`);
  };

  /**
   * GET /api/v1/auth/github/callback
   */
  githubCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = (req as any).user;
      if (!profile) {
        res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
        return;
      }

      let user = await User.findOne({ email: profile.email });
      if (!user) {
        user = new User({
          firstName: profile.displayName?.split(' ')[0],
          lastName: profile.displayName?.split(' ')[1] || '',
          email: profile.email,
          displayName: profile.displayName,
          avatar: profile.avatar_url,
          referralCode: await this.generateUniqueReferralCode(),
          roles: ['user'],
        });
        await user.save();
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);
      user.refreshTokens.push(refreshToken);
      await user.save();

      res.redirect(`${config.frontendUrl}?token=${accessToken}&refreshToken=${refreshToken}`);
    } catch (error) {
      logger.error('GitHub callback error:', error);
      res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }
  };

  // -------------------- Helpers --------------------

  private generateAccessToken(user: IUser): string {
    return jwt.sign(
      { userId: user._id, email: user.email, roles: user.roles },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiresIn || '15m' }
    );
  }

  private generateRefreshToken(user: IUser): string {
    return jwt.sign(
      { userId: user._id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn || '7d' }
    );
  }

  private sanitizeUser(user: IUser) {
    return {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      avatar: user.avatar,
      roles: user.roles,
      subscriptionTier: user.subscriptionTier,
      walletBalance: user.walletBalance,
      xp: user.xp,
      level: user.level,
      referralCode: user.referralCode,
      streaks: user.streak,
      setupDone: user.isApprovedInstructor !== undefined, // or your own field
      createdAt: user.createdAt,
    };
  }

  private async generateUniqueReferralCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    const existing = await User.findOne({ referralCode: code });
    if (existing) return this.generateUniqueReferralCode();
    return code;
  }
}

export default AuthController;
