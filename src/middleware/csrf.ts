// ============================================
// FILE: src/middleware/csrf.ts (unchanged)
// ============================================
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const generateCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.session) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    (req as any).csrfToken = token;
  } else { (req as any).csrfToken = req.session.csrfToken; }
  next();
};

export const verifyCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.includes('/webhooks')) return next();
  const clientToken = req.headers['x-csrf-token'] || req.body._csrf;
  const serverToken = req.cookies['csrf-token'];
  if (!clientToken || !serverToken || clientToken !== serverToken) { res.status(403).json({ success: false, message: 'Invalid CSRF token' }); return; }
  next();
};

export const simpleCsrf = (req: Request, res: Response, next: NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  const host = req.get('host');
  if (origin && !origin.includes(host as string)) { res.status(403).json({ success: false, message: 'Invalid request origin' }); return; }
  if (referer && !referer.includes(host as string)) { res.status(403).json({ success: false, message: 'Invalid request referer' }); return; }
  next();
};
