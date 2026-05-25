import { Router } from 'express';
import { AffiliateService } from '../services/AffiliateService';
import { Course } from '../models/Course';

const router = Router();
const affiliateService = AffiliateService.getInstance();

// Public affiliate click tracker – no authentication required
router.get('/aff/:userId/:courseId/:code', async (req, res) => {
  const { userId, courseId, code } = req.params;
  try {
    await affiliateService.trackClick(userId, courseId, code, req);
    const course = await Course.findById(courseId);
    const redirectUrl = course ? `${process.env.FRONTEND_URL}/courses/${courseId}` : `${process.env.FRONTEND_URL}/explore`;
    res.redirect(redirectUrl);
  } catch (error) {
    // Even on error, redirect to the course page (don't show 404)
    res.redirect(`${process.env.FRONTEND_URL}/explore`);
  }
});

export default router;
