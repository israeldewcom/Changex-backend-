// ============================================
// FILE: src/middleware/errorHandler.ts (unchanged)
// ============================================
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AuditLog } from '../models/AuditLog';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction): void => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal server error';
  logger.error({ message: err.message, stack: err.stack, url: req.url, method: req.method, ip: req.ip, user: (req as any).user?.userId });
  if (statusCode === 403 || statusCode === 401) {
    AuditLog.create({ user: (req as any).user?.userId, action: 'ERROR', resource: req.url, details: { error: message, statusCode }, ip: req.ip || req.socket.remoteAddress || '', userAgent: req.get('user-agent') || '', status: 'failure', error: message }).catch(e => logger.error('Audit log error:', e));
  }
  const response = { success: false, message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) };
  res.status(statusCode).json(response);
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
