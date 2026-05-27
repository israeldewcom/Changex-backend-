import { Request, Response, NextFunction } from 'express';
export const audit = (action: string, resource: string) => {
  return async (req: Request, res: Response, next: NextFunction) => { next(); };
};
