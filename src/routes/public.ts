// ============================================
// FILE: src/routes/public.ts (Complete – for affiliate click tracking)
// ============================================
import { Router } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { Course } from '../models/Course';
import { logger } from '../utils/logger';

const router = Router();
const affiliateService = AffiliateService.getInstance();

router.get('/aff/:userId/:courseId/:code', async (req, res) => {
  const { userId, courseId, code } = req.params;
  try {
    await affiliateService.trackClick(userId, courseId, code, req);
    const course = await Course.findById(courseId);
    const redirectUrl = course ? `${process.env.FRONTEND_URL}/courses/${courseId}` : `${process.env.FRONTEND_URL}/explore`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Affiliate click tracking failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/courses/${courseId}`);
  }
});

export default router;
