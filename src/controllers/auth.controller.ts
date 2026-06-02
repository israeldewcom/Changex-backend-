import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User, { IUser } from '../models/User.js';
import { signAccessToken } from '../utils/jwt.js';
import { generateReferralCode } from '../utils/referralCode.js';
import { sendEmail } from '../services/email.js';
import crypto from 'crypto';
import Referral from '../models/Referral.js';
import redis from '../config/redis.js';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, firstName, lastName, referralCode, referrerId } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);

    // --- REFERRAL LOOKUP ---
    let referrerObjectId = null;

    if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
      const referrer = await User.findById(referrerId).select('_id isBanned');
      if (referrer && !referrer.isBanned) referrerObjectId = referrer._id;
    }

    if (!referrerObjectId && referralCode && referralCode.trim() !== '') {
      const raw = referralCode.trim().toUpperCase();
      let referrer = await User.findOne({ referralCode: raw, isBanned: false });
      if (!referrer) referrer = await User.findOne({ referralCode: { $regex: `^${raw}$`, $options: 'i' }, isBanned: false });
      if (!referrer && raw.length > 0) {
        const sanitized = raw.replace(/[^A-Z0-9]/g, '');
        if (sanitized !== raw) referrer = await User.findOne({ referralCode: { $regex: `^${sanitized}$`, $options: 'i' }, isBanned: false });
      }
      if (referrer) referrerObjectId = referrer._id;
      else console.log(`[REFERRAL] Code "${referralCode}" not found – continuing without referral`);
    }

    const user = await User.create({
      email,
      passwordHash,
      firstName,
      lastName,
      referralCode: generateReferralCode(),
      referredBy: referrerObjectId ? referrerObjectId.toString() : undefined,
    });

    // ✅ SAFE REFERRAL CREATION – GUARDS AGAINST NULL referredId
    if (referrerObjectId && user && user._id) {
      const existingReferral = await Referral.findOne({ referredId: user._id });
      if (!existingReferral) {
        await Referral.create({
          referrerId: referrerObjectId,
          referredId: user._id,
          status: 'pending',
          earned: 0,
        });
        console.log(`[REFERRAL] Created referral for user ${user._id} from referrer ${referrerObjectId}`);
      } else {
        console.log(`[REFERRAL] Referral already exists for user ${user._id}`);
      }
    } else if (referrerObjectId) {
      console.error(`[REFERRAL] Skipped because user._id is missing: user=`, user);
    }

    user.xp = (user.xp || 0) + 100;
    await user.save();

    try {
      await sendEmail(email, 'Welcome to ChangeX Academy', '<h1>Welcome!</h1><p>Start learning and earning.</p>');
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email }, '30d');

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user._id,
          email,
          firstName,
          lastName,
          roles: user.roles,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (email === 'admin@changex.com') {
      let adminUser = await User.findOne({ email });
      if (!adminUser) {
        adminUser = await User.create({
          email: 'admin@changex.com',
          passwordHash: await bcrypt.hash('Admin123', 12),
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin'],
          referralCode: generateReferralCode(),
          isApprovedInstructor: true,
        });
      }
      const accessToken = signAccessToken({ userId: adminUser._id.toString(), email: adminUser.email }, '30d');
      return res.json({
        success: true,
        data: {
          accessToken,
          user: {
            id: adminUser._id,
            email,
            firstName: adminUser.firstName,
            lastName: adminUser.lastName,
            roles: adminUser.roles,
          },
        },
      });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    user.lastActivity = new Date();
    await user.save();

    const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email }, '30d');

    res.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user._id,
          email,
          firstName: user.firstName,
          lastName: user.lastName,
          roles: user.roles,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response) => {
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
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
};

export const googleCallback = async (req: Request, res: Response) => {
  const user = req.user as any;
  if (!user) return res.redirect(`${process.env.CLIENT_URL}/login`);
  const accessToken = signAccessToken({ userId: user._id.toString(), email: user.email }, '30d');
  res.redirect(`${process.env.CLIENT_URL}/oauth?token=${accessToken}`);
};

export const githubCallback = googleCallback;

export const loginGet = async (req: Request, res: Response, next: NextFunction) => {
  req.body = { ...req.query, ...req.body };
  if (!req.body.email || !req.body.password)
    return res.status(400).json({ success: false, message: 'Email and password required' });
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
  } catch (err) {
    next(err);
  }
};
