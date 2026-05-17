import { Request, Response } from 'express';
import { Course, User } from '../models';

export class CourseController {
  // Get all published courses
  getAllCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const courses = await Course.find({ published: true, approvalStatus: 'approved' })
        .populate('instructor', 'firstName lastName');
      res.json({ success: true, data: courses });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // Get single course
  getCourseById = async (req: Request, res: Response): Promise<void> => {
    try {
      const course = await Course.findById(req.params.id).populate('instructor', 'firstName lastName');
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      res.json({ success: true, data: course });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // Create course (with defaults for all fields)
  createCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { title, description, lessons, price, category, level, thumbnail } = req.body;

      if (!title) {
        res.status(400).json({ success: false, message: 'Title is required' });
        return;
      }

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const course = new Course({
        title,
        slug,
        description: description || 'No description provided',
        category: category || 'Web Development',
        level: (level || 'beginner').toLowerCase(),
        price: price || 0,
        thumbnail: thumbnail || '📚',
        instructor: userId,
        lessons: lessons || [],
        published: false,
        approvalStatus: 'pending',
      });
      await course.save();
      res.status(201).json({ success: true, data: course, message: 'Course saved' });
    } catch (error: any) {
      console.error('Create course error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  };

  // Update course
  updateCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.userId;
      const course = await Course.findById(id);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      if (course.instructor.toString() !== userId && !(req as any).user?.roles.includes('admin')) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }
      const updateData = req.body;
      if (updateData.title) updateData.slug = updateData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const updatedCourse = await Course.findByIdAndUpdate(id, updateData, { new: true });
      res.json({ success: true, data: updatedCourse, message: 'Course updated' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };

  // Get user's enrolled courses
  getMyCourses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const enrollments = await Enrollment.find({ user: userId }).populate('course');
      res.json({ success: true, data: enrollments });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
