import { Request, Response, NextFunction } from 'express';
import Challenge from '../models/Challenge.js';
import { IUser } from '../models/User.js';

export const getActiveChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const challenges = await Challenge.find({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort('-startDate');
    res.json({ success: true, data: challenges });
  } catch (err) { next(err); }
};

export const getUpcomingChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const challenges = await Challenge.find({
      status: 'upcoming',
      startDate: { $gt: now }
    }).sort('startDate');
    res.json({ success: true, data: challenges });
  } catch (err) { next(err); }
};

export const joinChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    if (challenge.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Challenge is not active' });
    }
    if (challenge.participants.includes(user._id)) {
      return res.status(400).json({ success: false, message: 'Already joined' });
    }
    challenge.participants.push(user._id);
    await challenge.save();
    res.json({ success: true, message: 'Joined challenge!' });
  } catch (err) { next(err); }
};

export const getChallengeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const challenge = await Challenge.findById(id);
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    res.json({ success: true, data: challenge });
  } catch (err) { next(err); }
};

export const getUserChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const challenges = await Challenge.find({ participants: user._id }).sort('-endDate');
    res.json({ success: true, data: challenges });
  } catch (err) { next(err); }
};
