import { Request, Response } from 'express';
import { IUser } from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import PDFDocument from 'pdfkit';
import axios from 'axios';

export const downloadCertificate = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    // Verify course completion
    const enrollment = await Enrollment.findOne({ userId: user._id, courseId, status: 'completed' });
    if (!enrollment) {
      return res.status(403).json({ success: false, message: 'Course not completed' });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Create PDF
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=certificate_${courseId}.pdf`);
      res.send(buffer);
    });

    // Use instructor‑uploaded template if available, else default
    if (course.certificateTemplate) {
      try {
        const response = await axios.get(course.certificateTemplate, { responseType: 'arraybuffer' });
        const templateBuffer = Buffer.from(response.data, 'binary');
        doc.image(templateBuffer, 0, 0, { width: doc.page.width, height: doc.page.height });
      } catch (err) {
        console.error('Failed to load certificate template, using default', err);
        drawDefaultCertificate(doc, user, course);
      }
    } else {
      drawDefaultCertificate(doc, user, course);
    }

    // Overlay text (name, course, date, powered by)
    doc.fontSize(24).font('Helvetica-Bold')
      .text(`${user.firstName} ${user.lastName}`, 0, doc.page.height / 2 - 40, { align: 'center' });
    doc.fontSize(18).font('Helvetica')
      .text(course.title, 0, doc.page.height / 2 + 20, { align: 'center' });
    doc.fontSize(12).font('Helvetica')
      .text(`Date: ${new Date().toLocaleDateString()}`, 0, doc.page.height - 100, { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Powered by ChangeX Academy', 0, doc.page.height - 60, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to generate certificate' });
  }
};

function drawDefaultCertificate(doc: PDFKit.PDFDocument, user: IUser, course: any) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f5f5f5');
  doc.rect(50, 50, doc.page.width - 100, doc.page.height - 100).stroke();
  doc.fontSize(30).font('Helvetica-Bold')
    .text('Certificate of Completion', 0, 120, { align: 'center' });
  doc.fontSize(16).font('Helvetica')
    .text('This certifies that', 0, 200, { align: 'center' });
}
