// ============================================================
// FILE: src/controllers/challenge.controller.ts (UPDATED - advanced challenge logic)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import Challenge from '../models/Challenge.js';
import ChallengeProgress from '../models/ChallengeProgress.js';
import { IUser } from '../models/User.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';
import Academy from '../models/Academy.js';
import AcademyMembership from '../models/AcademyMembership.js';

export const getActiveChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const filter: any = {
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    };
    // Academy scope
    const user = req.user as IUser;
    if (user && user.academyId) {
      filter.$or = [
        { academyId: user.academyId },
        { academyId: { $exists: false } }
      ];
    }
    const challenges = await Challenge.find(filter).sort('-startDate');
    res.json({ success: true, data: challenges });
  } catch (err) { next(err); }
};

export const getUpcomingChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const filter: any = {
      status: 'upcoming',
      startDate: { $gt: now }
    };
    const user = req.user as IUser;
    if (user && user.academyId) {
      filter.$or = [
        { academyId: user.academyId },
        { academyId: { $exists: false } }
      ];
    }
    const challenges = await Challenge.find(filter).sort('startDate');
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
    // Academy check
    const user = req.user as IUser;
    if (challenge.academyId && (!user || !user.academyId || challenge.academyId.toString() !== user.academyId.toString())) {
      return res.status(403).json({ success: false, message: 'This challenge belongs to a private academy' });
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
    // Academy check
    if (challenge.academyId) {
      const membership = await AcademyMembership.findOne({ academyId: challenge.academyId, userId: user._id });
      if (!membership || membership.status !== 'active') {
        return res.status(403).json({ success: false, message: 'You must be a member of this academy to join this challenge' });
      }
    }
    const existing = await ChallengeProgress.findOne({ challengeId: id, userId: user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    if (!challenge.participants.includes(user._id)) {
      challenge.participants.push(user._id);
      await challenge.save();
    }
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
      .populate('challengeId', 'title description startDate endDate rewardXP rewardAmount rewardPremiumDays completionCriteria challengeType')
      .sort('-createdAt');
    res.json({ success: true, data: progress });
  } catch (err) { next(err); }
};
