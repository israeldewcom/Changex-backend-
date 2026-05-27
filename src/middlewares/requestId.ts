import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.id = uuid();
  res.setHeader('X-Request-Id', req.id);
  next();
};
declare global { namespace Express { interface Request { id?: string; } } }
