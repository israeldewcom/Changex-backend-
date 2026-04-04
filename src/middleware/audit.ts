// ============================================
// FILE: src/middleware/audit.ts (unchanged)
// ============================================
import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog';

export const auditLog = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const originalEnd = res.end;
    let responseBody: any;
    (res as any).end = function(chunk?: any, encoding?: any, callback?: any) { responseBody = chunk; originalEnd.call(this, chunk, encoding, callback); };
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
      if (req.method === 'GET' && status === 'success') return;
      await AuditLog.create({ user: (req as any).user?.userId, action, resource, resourceId: req.params.id || req.params.courseId || req.params.productId, details: { method: req.method, url: req.url, query: req.query, body: req.method !== 'GET' ? req.body : undefined, responseStatus: res.statusCode, duration, userAgent: req.get('user-agent'), ip: req.ip || req.socket.remoteAddress }, ip: req.ip || req.socket.remoteAddress || '', userAgent: req.get('user-agent') || '', status }).catch(e => console.error('Audit log error:', e));
    });
    next();
  };
};

export const sensitiveAudit = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
      const safeBody = { ...req.body };
      delete safeBody.password; delete safeBody.currentPassword; delete safeBody.newPassword; delete safeBody.cardNumber; delete safeBody.cvv;
      await AuditLog.create({ user: (req as any).user?.userId, action, resource, resourceId: req.params.id, details: { method: req.method, url: req.url, body: safeBody, responseStatus: res.statusCode, duration, ip: req.ip }, ip: req.ip || req.socket.remoteAddress || '', userAgent: req.get('user-agent') || '', status }).catch(e => console.error('Audit log error:', e));
    });
    next();
  };
};
