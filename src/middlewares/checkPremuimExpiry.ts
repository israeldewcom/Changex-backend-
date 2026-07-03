import { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { IUser } from '../models/User.js';

export const checkPremiumExpiry = async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user as IUser;
  if (user && user.isPremium && user.subscriptionExpires && user.subscriptionExpires <= new Date()) {
    user.isPremium = false;
    user.tier = 'free';
    user.subscriptionExpires = undefined;
    await user.save();
    // Update req.user so subsequent middleware/controllers see the updated user
    req.user = user;
  }
  next();
};
