import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { Certificate } from '../models/Certificate';

const router = Router();

router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id).populate('user course');
    if (!certificate) {
      res.status(404).json({ success: false, message: 'Certificate not found' });
      return;
    }
    if (certificate.user._id.toString() !== (req as any).user.userId && !(req as any).user.roles.includes('admin')) {
      res.status(403).json({ success: false, message: 'Not authorized' });
      return;
    }
    // For demo, redirect to stored PDF URL
    res.redirect(certificate.pdfUrl);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
