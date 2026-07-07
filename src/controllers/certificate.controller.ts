// ============================================================
// FILE: src/controllers/certificate.controller.ts (UPDATED)
// ============================================================

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
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

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

    const isCompleted = enrollment.status === 'completed' || enrollment.progress >= 100;

    if (!isCompleted) {
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

    // Extract additional details for the certificate
    const topics = course.topics || course.outcomes || [];
    const programType = 'Online Course';
    const duration = `${course.totalLessons || 0} lessons • ${course.level || 'Self‑Paced'}`;
    const level = course.level || 'Intermediate';
    const issuer = 'ChangeX Academy';

    // Generate certificate with enhanced design
    const pdfBuffer = await generateCertificatePDF({
      userName: `${user.firstName} ${user.lastName}`,
      programTitle: course.title,
      topics: Array.isArray(topics) ? topics : [],
      programType,
      duration,
      level,
      issuer,
      completionDate: enrollment.completedAt || new Date(),
      instructorName,
      userEmail: user.email,
    });

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
