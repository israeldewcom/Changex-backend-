import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { config } from '../config';

export class AuthController {

  // POST /register
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { firstName, lastName, email, password, phone, referralCode } = req.body;
      const existing = await User.findOne({ email });
      if (existing) {
        res.status(400).json({ success: false, message: 'Email already exists' });
        return;
      }

      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phone,
        displayName: `${firstName} ${lastName}`,
        referralCode,
      });

      await user.save();

      const accessToken = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user._id }, config.jwt.refreshSecret, { expiresIn: '7d' });

      user.refreshTokens.push(refreshToken);
      await user.save();

      res.status(201).json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          walletBalance: user.walletBalance,
          referralCode: user.referralCode,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /login
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email }).select('+password');
      if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const accessToken = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ userId: user._id }, config.jwt.refreshSecret, { expiresIn: '7d' });

      user.refreshTokens.push(refreshToken);
      await user.save();

      res.json({
        success: true,
        accessToken,
        refreshToken,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          walletBalance: user.walletBalance,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /refresh-token
  async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const decoded: any = jwt.verify(refreshToken, config.jwt.refreshSecret);
      const user = await User.findById(decoded.userId);
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        res.status(401).json({ success: false, message: 'Invalid token' });
        return;
      }

      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      const newAccess = jwt.sign({ userId: user._id }, config.jwt.accessSecret, { expiresIn: '15m' });
      const newRefresh = jwt.sign({ userId: user._id }, config.jwt.refreshSecret, { expiresIn: '7d' });
      user.refreshTokens.push(newRefresh);
      await user.save();

      res.json({ success: true, accessToken: newAccess, refreshToken: newRefresh });
    } catch (err: any) {
      res.status(401).json({ success: false, message: 'Token invalid' });
    }
  }

  // POST /logout
  async logout(req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, message: 'Logged out' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /forgot-password
  async forgotPassword(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'If email exists, reset link sent' });
  }

  // POST /reset-password
  async resetPassword(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Password reset (stub)' });
  }

  // GET /google
  async googleAuth(req: Request, res: Response): Promise<void> {
    res.redirect('/auth/google/real'); // placeholder
  }

  // GET /google/callback
  async googleCallback(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'Google callback' });
  }

  // GET /github
  async githubAuth(req: Request, res: Response): Promise<void> {
    res.redirect('/auth/github/real'); // placeholder
  }

  // GET /github/callback
  async githubCallback(req: Request, res: Response): Promise<void> {
    res.json({ success: true, message: 'GitHub callback' });
  }
}
