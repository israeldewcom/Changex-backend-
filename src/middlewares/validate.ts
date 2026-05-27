import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
export const validate = (schema: Joi.ObjectSchema, source: 'body' | 'params' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req[source], { abortEarly: false });
    if (error) return res.status(422).json({ success: false, errors: error.details.map(e => e.message) });
    next();
  };
};
