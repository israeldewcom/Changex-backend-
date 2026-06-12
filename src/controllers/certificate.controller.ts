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

    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (!courseId) {
      return res.status(400). json({ success: false, message: 'Course ID is required' });
    }

    // Find the enrollment with proper course population
    const enrollment = await Enrollment.findOne({
      userId: user._id,
      courseId: courseId
    }).populate('courseId');

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    // Check if course is completed (either status 'completed' OR progress 100)
    const isCompleted = enrollment.status === 'completed' || enrollment.progress >= 100;

    if (!isCompleted) {
      // Double-check by counting completed lessons vs total lessons
      const totalLessons = await Lesson.countDocuments({ courseId: courseId });
      const completedLessons = await LessonProgress.countDocuments({
        enrollmentId: enrollment._id,
        completed: true
      });

      const actualProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      if (actualProgress < 100) {
        return res.status(403).json({
          success: false,
          message: `Certificate not available yet. You have completed ${actualProgress}% of the course. Complete all lessons first.`
        });
      }

      // Update enrollment to completed
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      enrollment.progress = 100;
      await enrollment.save();
    }

    const course = enrollment.courseId as any;
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Get instructor name if available
    let instructorName = 'ChangeX Academy';
    if (course.instructorId) {
      const instructor = await (await import('../models/User.js')).default.findById(course.instructorId);
      if (instructor) {
        instructorName = `${instructor.firstName} ${instructor.lastName}`;
      }
    }

    // Generate certificate PDF
    const pdfBuffer = await generateCertificatePDF(
      `${user.firstName} ${user.lastName}`,
      course.title,
      enrollment.completedAt || new Date(),
      course.certificateTemplate,
      instructorName,
      user.email
    );

    // Send PDF as downloadable file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Certificate_${course.title.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(pdfBuffer);

  } catch (err) {
    console.error('Certificate generation error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      success: false,
      message: `Failed to generate certificate: ${errorMessage}`
    });
  }
};

export const checkCertificateAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;

    if (!user || !user._id) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const enrollment = await Enrollment.findOne({
      userId: user._id,
      courseId: courseId
    });

    if (!enrollment) {
      return res.json({ success: true, data: { available: false, message: 'Not enrolled' } });
    }

    const isCompleted = enrollment.status === 'completed' || enrollment.progress >= 100;

    if (isCompleted) {
      return res.json({ success: true, data: { available: true, message: 'Certificate available' } });
    }

    // Calculate exact progress
    const totalLessons = await Lesson.countDocuments({ courseId: courseId });
    const completedLessons = await LessonProgress.countDocuments({
      enrollmentId: enrollment._id,
      completed: true
    });
    const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    res.json({
      success: true,
      data: {
        available: false,
        progress: progress,
        message: `Complete ${100 - progress}% more to unlock certificate`
      }
    });
  } catch (err) {
    console.error('Certificate availability check error:', err);
    res.status(500).json({ success: false, message: String(err) });
  }
};
