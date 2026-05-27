import { Request, Response, NextFunction } from 'express';
import AffiliateLink from '../models/AffiliateLink.js';
import Course from '../models/Course.js';
import { IUser } from '../models/User.js';
import { v4 as uuid } from 'uuid';

export const acceptAffiliateOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.body;
    const user = req.user as IUser;
    const course = await Course.findById(courseId);
    if (!course || !course.hasAffiliate) {
      res.status(400).json({ success: false, message: 'Affiliate not available' });
      return;
    }

    let link = await AffiliateLink.findOne({ userId: user._id, courseId });
    if (link) {
      res.json({ success: true, data: link });
      return;
    }

    link = await AffiliateLink.create({
      userId: user._id,
      courseId,
      code: uuid().slice(0, 8),
    });

    res.status(201).json({ success: true, data: link });
  } catch (err) {
    next(err);
  }
};

export const getMyLinks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const links = await AffiliateLink.find({ userId: user._id }).populate('courseId', 'title price affiliatePercent');
    res.json({ success: true, data: links });
  } catch (err) {
    next(err);
  }
};

export const trackAffiliateClick = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;
    const link = await AffiliateLink.findOne({ code });
    if (!link) {
      res.redirect(`${process.env.CLIENT_URL}/courses`);
      return;
    }

    link.clicks += 1;
    await link.save();

    res.cookie('affiliate_code', code, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.redirect(`${process.env.CLIENT_URL}/courses/${link.courseId}`);
  } catch (err) {
    next(err);
  }
};
