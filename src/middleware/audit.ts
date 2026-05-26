// File: src/middlewares/audit.ts
import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog.js';

export const audit = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        AuditLog.create({
          userId: req.user?._id,
          action,
          resource,
          ip: req.ip,
          timestamp: new Date(),
        }).catch(console.error);
      }
      return originalJson(body);
    };
    next();
  };
};
