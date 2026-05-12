import { Request, Response } from 'express';
import { Certificate } from '../models/Certificate';

export class CertificateController {
  download = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.userId;
      const certificate = await Certificate.findById(id);
      if (!certificate) { res.status(404).json({ success: false, message: 'Certificate not found' }); return; }
      if (certificate.user.toString() !== userId && !(req as any).user.roles.includes('admin')) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }
      // In production, generate PDF or redirect to stored URL
      res.redirect(certificate.pdfUrl);
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
