// File: src/middlewares/validate.ts
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validate = (schema: Joi.ObjectSchema, source: 'body' | 'params' | 'query' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false });
    if (error) {
      return res.status(422).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(d => d.message),
      });
    }
    req[source] = value;
    next();
  };
};
