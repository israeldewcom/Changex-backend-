import { Request, Response, NextFunction } from 'express';
export const cacheResponse = (duration: string) => {
  return (req: Request, res: Response, next: NextFunction) => { next(); };
};
