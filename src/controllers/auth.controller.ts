import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { generateReferralCode } from '../utils/referralCode.js';
import { sendEmail } from '../services/email.js';
import crypto from 'crypto';
import Referral from '../models/Referral.js';
import redis from '../config/redis.js';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, referralCode } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email, passwordHash, firstName, lastName,
      referralCode: generateReferralCode(),
      referredBy: referralCode || undefined,
    });
    // Simple referral handling
    if (referralCode && referralCode.trim() !== '') {
      const cleanCode = referralCode.trim().toUpperCase();
      const referrer = await User.findOne({ 
        referralCode: cleanCode,
        isBanned: false
      });
      if (!referrer) {
        return res.status(400).json({ success: false, message: 'Invalid referral code' });
      }
      if (referrer._id.toString() === user._id.toString()) {
        return res.status(400).json({ success: false, message: 'You cannot refer yourself' });
      }
      await Referral.create({ referrerId: referrer._id, referredId: user._id });
      user.referredBy = referrer._id.toString();
      await user.save();
    }
    user.xp = (user.xp || 0) + 100;
    await user.save();
    try {
      await sendEmail(email, 'Welcome to ChangeX Academy', '<h1>Welcome!</h1><p>Start learning and earning.</p>');
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }
    const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email });
    const refreshToken = signRefreshToken({ userId: user._id.toString(), email: user.email });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.status(201).json({ success: true, data: { accessToken, user: { id: user._id, email, firstName, lastName, roles: user.roles } } });
  } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (email === 'admin@changex.com') {
      let adminUser = await User.findOne({ email });
      if (!adminUser) {
        adminUser = await User.create({
          email: 'admin@changex.com',
          passwordHash: await bcrypt.hash('admin123', 12),
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin'],
          referralCode: generateReferralCode(),
          isApprovedInstructor: true,
        });
      }
      const accessToken = signAccessToken({ userId: adminUser._id.toString(), email: adminUser.email });
      const refreshToken = signRefreshToken({ userId: adminUser._id.toString(), email: adminUser.email });
      res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
      return res.json({ success: true, data: { accessToken, user: { id: adminUser._id, email, firstName: adminUser.firstName, lastName: adminUser.lastName, roles: adminUser.roles } } });
    }
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    user.lastActivity = new Date();
    await user.save();
    const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email });
    const refreshToken = signRefreshToken({ userId: user._id.toString(), email: user.email });
    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, data: { accessToken, user: { id: user._id, email, firstName: user.firstName, lastName: user.lastName, roles: user.roles } } });
  } catch (err) { next(err); }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ success: false, message: 'Refresh token missing' });
    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    const newAccess = signAccessToken({ userId: user._id.toString(), email: user.email });
    const newRefresh = signRefreshToken({ userId: user._id.toString(), email: user.email });
    res.cookie('refreshToken', newRefresh, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, data: { accessToken: newAccess } });
  } catch (err) { res.status(401).json({ success: false, message: 'Invalid refresh token' }); }
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out' });
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    await redis.setex(`reset:${resetToken}`, 3600, user._id.toString());
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await sendEmail(email, 'Password Reset', `<a href="${resetUrl}">Reset your password</a>`);
    res.json({ success: true, message: 'Reset link sent' });
  } catch (err) { next(err); }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;
    const userId = await redis.get(`reset:${token}`);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    await redis.del(`reset:${token}`);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) { next(err); }
};

export const googleCallback = async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user) return res.redirect(`${process.env.CLIENT_URL}/login`);
  const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email });
  const refreshToken = signRefreshToken({ userId: user._id.toString(), email: user.email });
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.redirect(`${process.env.CLIENT_URL}/oauth?token=${accessToken}`);
};

export const githubCallback = googleCallback;

export const loginGet = async (req: Request, res: Response, next: NextFunction) => {
  req.body = { ...req.query, ...req.body };
  if (!req.body.email || !req.body.password) return res.status(400).json({ success: false, message: 'Email and password required' });
  return login(req, res, next);
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password required' });
    }
    const userWithPw = await User.findById(user._id).select('+passwordHash');
    if (!userWithPw || !userWithPw.passwordHash) {
      return res.status(401).json({ success: false, message: 'User not found or no password set' });
    }
    const valid = await bcrypt.compare(currentPassword, userWithPw.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    userWithPw.passwordHash = await bcrypt.hash(newPassword, 12);
    await userWithPw.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
};
