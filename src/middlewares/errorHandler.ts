// ============================================================
// FILE: src/middlewares/errorHandler.ts
// ============================================================
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// ─── Known Mongoose/MongoDB error shapes ──────────────────────
// These carry structured info we can turn into clean, safe
// messages instead of leaking driver/library internals to the client.
function normalizeKnownErrors(err: any): { status: number; message: string; errors?: any } | null {
  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e: any) => e.message);
    return { status: 400, message: 'Validation failed', errors: details };
  }

  // Mongoose bad ObjectId / cast error
  if (err.name === 'CastError') {
    return { status: 400, message: `Invalid value for field "${err.path}"` };
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return { status: 409, message: `${field} already exists` };
  }

  // express-validator style array
  if (Array.isArray(err.errors) && err.errors[0]?.msg) {
    return { status: 400, message: err.errors[0].msg, errors: err.errors };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid token' };
  }
  if (err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Token expired' };
  }

  // Malformed JSON body (express.json() throws a SyntaxError with a `body` prop)
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return { status: 400, message: 'Malformed JSON in request body' };
  }

  // Payload too large
  if (err.type === 'entity.too.large') {
    return { status: 413, message: 'Request payload too large' };
  }

  return null;
}

// ─── Main error handler (must be registered LAST, after all routes) ──
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // If headers are already sent, delegate to Express's default handler
  // instead of trying to send a second response.
  if (res.headersSent) {
    return next(err);
  }

  // Always log the full context + stack server-side, regardless of
  // what we end up telling the client.
  logger.error(
    `[ERROR] ${req.method} ${req.originalUrl} -> ${err.message}\n${err.stack || '(no stack trace)'}`
  );

  const known = normalizeKnownErrors(err);
  const status = known?.status || err.status || err.statusCode || 500;

  // Never leak raw internal/library error messages (e.g. Redis, driver
  // internals) on 5xx responses — only pass through messages we've
  // explicitly classified as safe, or ones the app itself threw on
  // purpose with an explicit `status` (4xx application errors).
  const isTrustedMessage = Boolean(known) || (err.status && err.status < 500);
  const safeMessage =
    status >= 500 && !isTrustedMessage
      ? 'Something went wrong. Please try again shortly.'
      : known?.message || err.message || 'Request failed';

  const payload: Record<string, any> = { success: false, message: safeMessage };
  if (known?.errors) payload.errors = known.errors;

  // Include stack trace in the response only outside production, to
  // help local/dev debugging without exposing internals to real users.
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }

  res.status(status).json(payload);
};

// ─── 404 handler for unmatched routes (optional convenience export) ──
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};
