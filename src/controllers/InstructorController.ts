import { Request, Response } from 'express';
import { Course, User } from '../models';
import path from 'path';
import fs from 'fs';

export class InstructorController {
  // Get instructor dashboard stats
  getDashboardStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const courses = await Course.find({ instructor: userId });
      res.json({
        success: true,
        data: {
          totalCourses: courses.length,
          totalStudents: 0,
          totalRevenue: 0,
          courses: courses,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // Submit course for approval
  submitCourseForApproval = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { courseId } = req.params;
      const course = await Course.findOne({ _id: courseId, instructor: userId });
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      if (course.lessons.length < 20) {
        res.status(400).json({ success: false, message: 'Minimum 20 lessons required' });
        return;
      }
      course.approvalStatus = 'pending';
      await course.save();
      res.json({ success: true, message: 'Course submitted for approval' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // Upload course media (thumbnail, video, resource)
  uploadCourseMedia = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { courseId, type } = req.params;
      const course = await Course.findOne({ _id: courseId, instructor: userId });
      if (!course) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      // Create uploads directory if it doesn't exist
      const uploadDir = path.join(__dirname, '../../uploads', `courses/${courseId}/${type}`);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Save file
      const filename = `${Date.now()}-${req.file.originalname}`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, req.file.buffer);

      // Generate URL
      const url = `${process.env.BACKEND_URL || 'https://changex-backend-etfk.onrender.com'}/uploads/courses/${courseId}/${type}/${filename}`;

      // If thumbnail, update course thumbnail
      if (type === 'thumbnail') {
        course.thumbnail = url;
        await course.save();
      }

      res.json({ success: true, data: { url }, message: `${type} uploaded` });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };
}
