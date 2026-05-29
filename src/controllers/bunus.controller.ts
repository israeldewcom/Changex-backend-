import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Transaction from '../models/Transaction.js';

export const claimWelcomeBonus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if ((user as any).welcomeBonusClaimed) {
      res.status(400).json({ success: false, message: 'Bonus already claimed' });
      return;
    }
    if (!user.bio && !user.location) {
      res.status(400).json({ success: false, message: 'Please complete your profile first' });
      return;
    }
    user.walletBalance += 500;
    (user as any).welcomeBonusClaimed = true;
    await user.save();
    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: 500,
      status: 'completed',
      description: 'Welcome bonus for completing profile',
    });
    res.json({ success: true, message: '₦500 added to your wallet', balance: user.walletBalance });
  } catch (err) { next(err); }
};
