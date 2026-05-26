// File: src/controllers/affiliate.controller.ts
import { Request, Response, NextFunction } from 'express';
import AffiliateLink from '../models/AffiliateLink.js';
import Course from '../models/Course.js';
import { v4 as uuid } from 'uuid';

export const acceptAffiliateOffer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.body;
    const course = await Course.findById(courseId);
    if (!course || !course.hasAffiliate) return res.status(400).json({ success: false, message: 'Affiliate not available' });

    let link = await AffiliateLink.findOne({ userId: req.user!._id, courseId });
    if (link) return res.json({ success: true, data: link });

    link = await AffiliateLink.create({
      userId: req.user!._id,
      courseId,
      code: uuid().slice(0, 8),
    });

    res.status(201).json({ success: true, data: link });
  } catch (err) {
    next(err);
  }
};

export const getMyLinks = async (req: Request, res: Response, next: NextFunction) => {
  const links = await AffiliateLink.find({ userId: req.user!._id }).populate('courseId', 'title price affiliatePercent totalEarned');
  res.json({ success: true, data: links });
};

export const trackAffiliateClick = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;
    const link = await AffiliateLink.findOne({ code });
    if (!link) return res.redirect(`${process.env.CLIENT_URL}/courses`);

    link.clicks += 1;
    await link.save();

    // Set cookie for 30 days to track conversion
    res.cookie('affiliate_code', code, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.redirect(`${process.env.CLIENT_URL}/courses/${link.courseId}`);
  } catch (err) {
    next(err);
  }
};
