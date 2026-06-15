import { Request, Response, NextFunction } from 'express';
import Challenge from '../models/Challenge.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { getIO } from '../socket.js';

export const getActiveChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const challenges = await Challenge.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort('endDate');
    res.json({ success: true, data: challenges });
  } catch (err) {
    next(err);
  }
};

export const getAllChallenges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const challenges = await Challenge.find().sort('-createdAt');
    res.json({ success: true, data: challenges });
  } catch (err) {
    next(err);
  }
};

export const getChallengeById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const challenge = await Challenge.findById(id);
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    res.json({ success: true, data: challenge });
  } catch (err) {
    next(err);
  }
};

export const createChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const challenge = await Challenge.create(req.body);
    res.status(201).json({ success: true, data: challenge });
  } catch (err) {
    next(err);
  }
};

export const updateChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { id } = req.params;
    const challenge = await Challenge.findByIdAndUpdate(id, req.body, { new: true });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    res.json({ success: true, data: challenge });
  } catch (err) {
    next(err);
  }
};

export const deleteChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { id } = req.params;
    await Challenge.findByIdAndDelete(id);
    res.json({ success: true, message: 'Challenge deleted' });
  } catch (err) {
    next(err);
  }
};

export const joinChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { challengeId } = req.params;
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.participants.includes(user._id)) {
      return res.status(400).json({ success: false, message: 'Already joined' });
    }
    if (challenge.maxParticipants && challenge.participants.length >= challenge.maxParticipants) {
      return res.status(400).json({ success: false, message: 'Challenge is full' });
    }
    challenge.participants.push(user._id);
    await challenge.save();
    res.json({ success: true, message: 'Joined challenge' });
  } catch (err) {
    next(err);
  }
};

export const submitChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { challengeId } = req.params;
    const { content } = req.body;
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    const existing = challenge.submissions.find(s => s.userId.toString() === user._id.toString());
    if (existing) {
      return res.status(400).json({ success: false, message: 'Already submitted' });
    }
    challenge.submissions.push({
      userId: user._id,
      content,
      submittedAt: new Date(),
      isWinner: false
    });
    await challenge.save();
    res.json({ success: true, message: 'Submission recorded' });
  } catch (err) {
    next(err);
  }
};

export const awardChallengeWinners = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const { challengeId } = req.params;
    const { winnerUserIds } = req.body; // array of user IDs
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    for (const winnerId of winnerUserIds) {
      const submission = challenge.submissions.find(s => s.userId.toString() === winnerId);
      if (submission) {
        submission.isWinner = true;
        const winner = await User.findById(winnerId);
        if (winner) {
          winner.xp += challenge.rewardXP;
          winner.walletBalance += challenge.rewardMoney;
          await winner.save();
          await Transaction.create({
            userId: winner._id,
            type: 'bonus',
            amount: challenge.rewardMoney,
            status: 'completed',
            description: `Winner of challenge: ${challenge.title}`
          });
          await Notification.create({
            userId: winner._id,
            title: 'Challenge Winner!',
            message: `Congratulations! You won the "${challenge.title}" challenge and earned ${challenge.rewardXP} XP and ₦${challenge.rewardMoney}.`,
            type: 'system'
          });
          getIO().to(`user:${winner._id}`).emit('notification', { title: 'Challenge Winner!' });
        }
      }
    }
    await challenge.save();
    res.json({ success: true, message: 'Winners awarded' });
  } catch (err) {
    next(err);
  }
};
