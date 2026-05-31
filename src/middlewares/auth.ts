import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import User, { IUser } from '../models/User.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[AUTH] Missing or invalid Authorization header');
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.error('[AUTH] Empty token');
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  if (!decoded || !decoded.userId) {
    console.error('[AUTH] Token missing userId');
    return res.status(401).json({ success: false, message: 'Invalid token payload' });
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    console.error('[AUTH] User not found for ID:', decoded.userId);
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  if (user.isBanned) {
    console.error('[AUTH] Banned user:', user.email);
    return res.status(403).json({ success: false, message: 'Account banned. Contact support.' });
  }

  req.user = user;
  next();
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.some(role => req.user!.roles.includes(role))) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};
