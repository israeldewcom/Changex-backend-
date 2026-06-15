import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import LessonInteraction from '../models/LessonInteraction.js';

export const saveLessonInteraction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId } = req.params;
    const { type, content } = req.body;

    await LessonInteraction.findOneAndUpdate(
      { lessonId, userId: user._id, type },
      { content, savedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Interaction saved' });
  } catch (err) {
    next(err);
  }
};

export const getLessonInteraction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessonId, type } = req.params;
    const interaction = await LessonInteraction.findOne({ lessonId, userId: user._id, type });
    res.json({ success: true, data: interaction || null });
  } catch (err) {
    next(err);
  }
};
