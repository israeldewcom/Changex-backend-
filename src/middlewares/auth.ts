// ============================================================
// FILE: src/middlewares/auth.ts (UPDATED - added academyAuth)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import User, { IUser } from '../models/User.js';
import Academy from '../models/Academy.js';
import AcademyMembership from '../models/AcademyMembership.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload' });
    }
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'Your account has been banned. Contact support.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS') {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.some(role => req.user!.roles.includes(role))) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
};

// ─── NEW: Academy Authorization Middleware ────────────────────────────
export const academyAuth = (requiredRole?: string | string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const academyId = req.params.academyId || req.query.academyId || req.body.academyId;
      if (!academyId) {
        return res.status(400).json({ success: false, message: 'Academy ID required' });
      }

      // Check if user belongs to academy
      const membership = await AcademyMembership.findOne({
        academyId: academyId,
        userId: req.user._id,
        status: 'active'
      });

      if (!membership) {
        return res.status(403).json({ success: false, message: 'You are not a member of this academy' });
      }

      // If role required, check membership role
      if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        if (!roles.includes(membership.role)) {
          return res.status(403).json({ success: false, message: 'Insufficient academy permissions' });
        }
      }

      // Attach membership to request for downstream use
      (req as any).academyMembership = membership;
      (req as any).academyId = academyId;
      next();
    } catch (err) {
      next(err);
    }
  };
};
