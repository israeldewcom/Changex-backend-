import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; roles: string[] };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.accessSecret) as { userId: string };
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive || user.isBanned) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    req.user = { userId: user._id.toString(), email: user.email, roles: user.roles };
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export const requireCreator = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }
  const user = await User.findById(req.user.userId);
  const isAdmin = user?.roles.includes('admin');
  const isPremium = user?.subscriptionTier === 'premium' && user?.subscriptionStatus === 'active';
  if (isAdmin || isPremium || user?.isApprovedInstructor) {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Premium subscription required to create courses' });
  }
};
