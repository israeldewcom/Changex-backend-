import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { AuditLog } from '../models/AuditLog';
import { User } from '../models/User';
import passport from 'passport';
import { AffiliateService } from '../services/AffiliateService';

export class AuthController {
  private authService: AuthService;
  private affiliateService: AffiliateService;
  
  constructor() { 
    this.authService = AuthService.getInstance();
    this.affiliateService = AffiliateService.getInstance();
  }

  register = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { 
      res.status(400).json({ success: false, message: 'Please check your input', errors: errors.array() }); 
      return; 
    }
    
    try {
      const { email, password, firstName, lastName, referralCode } = req.body;
      
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({ success: false, message: 'User with this email already exists' });
        return;
      }
      
      const user = await this.authService.registerUser({ email, password, firstName, lastName, referralCode });
      
      await AuditLog.create({ 
        user: user._id, 
        action: 'REGISTER', 
        resource: 'User', 
        resourceId: user._id.toString(), 
        details: { email: user.email, referralCode: referralCode || 'none' }, 
        ip: req.ip || req.socket.remoteAddress || '', 
        userAgent: req.get('user-agent') || '', 
        status: 'success' 
      });
      
      res.status(201).json({ 
        success: true, 
        message: 'Registration successful. Please verify your email.', 
        data: { 
          id: user._id, 
          email: user.email, 
          firstName: user.firstName, 
          lastName: user.lastName 
        } 
      });
    } catch (error: any) { 
      logger.error('Registration error:', error);
      res.status(400).json({ success: false, message: error.message || 'Registration failed' });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    console.log('[LOGIN] Request received');
    const errors = validationResult(req);
    if (!errors.isEmpty()) { 
      console.log('[LOGIN] Validation errors:', errors.array());
      res.status(400).json({ 
        success: false, 
        message: 'Please check your input',
        errors: errors.array() 
      }); 
      return; 
    }
    
    try {
      const { email, password, twoFactorCode } = req.body;
      const ip = req.ip || req.socket.remoteAddress || '';
      
      console.log(`[LOGIN] Attempting login for: ${email}`);
      const result = await this.authService.loginUser(email, password, ip, twoFactorCode);
      
      if (result.requiresTwoFactor) {
        res.status(200).json({ success: true, requiresTwoFactor: true, message: 'Two‑factor code required' });
        return;
      }
      
      res.cookie('refreshToken', result.refreshToken, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: 'strict', 
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });
      
      await AuditLog.create({ 
        user: result.user._id, 
        action: 'LOGIN', 
        resource: 'User', 
        resourceId: result.user._id.toString(), 
        details: { email: result.user.email, ip }, 
        ip, 
        userAgent: req.get('user-agent') || '', 
        status: 'success' 
      });
      
      console.log(`[LOGIN] Success for: ${email}`);
      res.json({ 
        success: true, 
        data: { 
          user: { 
            id: result.user._id, 
            email: result.user.email, 
            firstName: result.user.firstName, 
            lastName: result.user.lastName, 
            displayName: result.user.displayName, 
            avatar: result.user.avatar, 
            subscriptionTier: result.user.subscriptionTier, 
            level: result.user.level, 
            xp: result.user.xp, 
            walletBalance: result.user.walletBalance 
          }, 
          accessToken: result.accessToken 
        } 
      });
    } catch (error: any) { 
      console.error('[LOGIN] Error:', error.message);
      logger.error('Login error:', error); 
      res.status(401).json({ success: false, message: error.message || 'Invalid credentials' }); 
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
        maxAge: 7 * 24 * 60 * 60 * 1000 
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
      
      if (refreshToken && userId) {
        await this.authService.logout(userId, refreshToken);
      }
      
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
      res.json({ 
        success: true, 
        message: 'If an account exists with that email, a password reset link has been sent.' 
      });
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
      
      const user = await User.findById(userId).select('+password');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      
      const isValid = await user.comparePassword(currentPassword);
      if (!isValid) {
        res.status(401).json({ success: false, message: 'Current password is incorrect' });
        return;
      }
      
      user.password = newPassword;
      await user.save();
      
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
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

  googleAuth = (req: Request, res: Response, next: any) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_not_configured`);
    }
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  };
  
  googleCallback = (req: Request, res: Response, next: any) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_not_configured`);
    }
    passport.authenticate('google', { session: false }, (err: any, user: any) => {
      if (err || !user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
      }
      const { accessToken } = this.authService.generateTokens(user._id.toString());
      res.redirect(`${process.env.FRONTEND_URL}/?token=${accessToken}`);
    })(req, res, next);
  };

  githubAuth = (req: Request, res: Response, next: any) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_not_configured`);
    }
    passport.authenticate('github', { scope: ['user:email'] })(req, res, next);
  };
  
  githubCallback = (req: Request, res: Response, next: any) => {
    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_not_configured`);
    }
    passport.authenticate('github', { session: false }, (err: any, user: any) => {
      if (err || !user) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
      }
      const { accessToken } = this.authService.generateTokens(user._id.toString());
      res.redirect(`${process.env.FRONTEND_URL}/?token=${accessToken}`);
    })(req, res, next);
  };
}
