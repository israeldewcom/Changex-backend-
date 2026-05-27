// src/controllers/certificate.controller.ts
import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import { generateCertificate } from '../services/pdfGenerator.js';

export const downloadCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const enrollment = await Enrollment.findOne({ userId: user._id, courseId, status: 'completed' });
    if (!enrollment) {
      res.status(403).json({ success: false, message: 'Complete the course first' });
      return;
    }
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    const pdfUrl = await generateCertificate(`${user.firstName} ${user.lastName}`, course.title, enrollment.completedAt || new Date());
    res.json({ success: true, data: { url: pdfUrl } });
  } catch (err) { next(err); }
};
