import { Request, Response, NextFunction } from 'express';
import Challenge from '../models/Challenge.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
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
    // Check if already enrolled via progress
    const existing = await ChallengeProgress.findOne({ challengeId: id, userId: user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    // Add to participants array (for backward compatibility)
    if (!challenge.participants.includes(user._id)) {
      challenge.participants.push(user._id);
      await challenge.save();
    }
    // Create progress entry
    await ChallengeProgress.create({
      challengeId: id,
      userId: user._id,
      status: 'enrolled',
      startedAt: new Date(),
      progress: 0,
      progressValue: 0,
    });
    res.json({ success: true, message: 'Joined challenge!' });
  } catch (err) { next(err); }
};

export const getUserChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const challenges = await Challenge.find({ participants: user._id }).sort('-endDate');
    res.json({ success: true, data: challenges });
  } catch (err) { next(err); }
};

export const getUserChallengeProgress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const progress = await ChallengeProgress.find({ userId: user._id })
      .populate('challengeId', 'title description startDate endDate rewardXP rewardAmount rewardPremiumDays completionCriteria')
      .sort('-createdAt');
    res.json({ success: true, data: progress });
  } catch (err) { next(err); }
};
