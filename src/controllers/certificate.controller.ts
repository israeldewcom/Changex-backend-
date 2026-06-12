import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import LessonProgress from '../models/LessonProgress.js';
import Lesson from '../models/Lesson.js';
import { generateCertificatePDF } from '../services/pdfGenerator.js';

export const downloadCertificate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

    // 1. Find enrollment and verify course completion
    const enrollment = await Enrollment.findOne({
      userId: user._id,
      courseId: courseId,
    }).populate('courseId');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'You are not enrolled in this course.',
      });
    }

    // 2. Double‑check completion using lesson progress
    const totalLessons = await Lesson.countDocuments({ courseId: courseId });
    const completedLessons = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      completed: true,
    });

    const isCompleted = enrollment.status === 'completed' || (totalLessons > 0 && completedLessons === totalLessons);

    if (!isCompleted) {
      return res.status(403).json({
        success: false,
        message: 'Certificate is only available after completing all lessons.',
      });
    }

    // 3. Update enrollment status to 'completed' if not already
    if (enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      await enrollment.save();
    }

    const course = enrollment.courseId as any;
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // 4. Generate PDF certificate
    const pdfBuffer = await generateCertificatePDF(
      `${user.firstName} ${user.lastName}`,
      course.title,
      enrollment.completedAt || new Date(),
      course.certificateTemplate // optional custom background image URL
    );

    // 5. Send PDF file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate_${courseId}_${user._id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Certificate generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate certificate. Please try again later.',
    });
  }
};
