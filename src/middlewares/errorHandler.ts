import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
};
