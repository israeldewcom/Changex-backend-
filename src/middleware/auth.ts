// ============================================
// FILE: src/middleware/auth.ts (unchanged)
// ============================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { User } from '../models/User';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; roles: string[] };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) { res.status(401).json({ success: false, message: 'No token provided' }); return; }
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.accessSecret) as { userId: string };
    const user = await User.findById(decoded.userId).select('email roles isActive isBanned');
    if (!user) { res.status(401).json({ success: false, message: 'User not found' }); return; }
    if (!user.isActive || user.isBanned) { res.status(401).json({ success: false, message: 'Account is disabled' }); return; }
    req.user = { userId: user._id.toString(), email: user.email, roles: user.roles };
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') res.status(401).json({ success: false, message: 'Token expired' });
    else if (error.name === 'JsonWebTokenError') res.status(401).json({ success: false, message: 'Invalid token' });
    else { logger.error('Auth middleware error:', error); res.status(500).json({ success: false, message: 'Authentication error' }); }
  }
};

export const requireRole = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) { res.status(401).json({ success: false, message: 'Not authenticated' }); return; }
  const hasRole = req.user.roles.some(role => roles.includes(role));
  if (!hasRole) { res.status(403).json({ success: false, message: 'Insufficient permissions' }); return; }
  next();
};

export const requireCreator = requireRole('creator', 'admin');
export const requireAdmin = requireRole('admin');

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwt.accessSecret) as { userId: string };
      const user = await User.findById(decoded.userId).select('email roles');
      if (user && user.isActive && !user.isBanned) {
        req.user = { userId: user._id.toString(), email: user.email, roles: user.roles };
      }
    }
    next();
  } catch (error) { next(); }
};
