import { Request, Response } from 'express';
import { Course, User, Enrollment } from '../models';

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
      const { title, description, lessons, price, category, level, thumbnail, hasAffiliate, affiliateCommission } = req.body;

      if (!title) {
        res.status(400).json({ success: false, message: 'Title is required' });
        return;
      }

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const course = new Course({
        title,
        slug,
        description: description || 'No description provided',
        longDescription: description || 'No description provided',
        category: category || 'Web Development',
        level: (level || 'beginner').toLowerCase(),
        price: price || 0,
        thumbnail: thumbnail || '📚',
        instructor: userId,
        lessons: lessons || [],
        published: false,
        approvalStatus: 'pending',
        hasAffiliate: hasAffiliate || false,
        affiliateCommission: affiliateCommission || 20,
      });
      await course.save();
      res.status(201).json({ success: true, data: course, message: 'Course saved successfully' });
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
      
      // If course was approved and non-admin edits, set back to pending
      if (course.approvalStatus === 'approved' && !(req as any).user?.roles.includes('admin')) {
        updateData.approvalStatus = 'pending';
        updateData.published = false;
      }
      
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

  // Enroll in course
  enrollCourse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { courseId } = req.params;
      const userId = (req as any).user?.userId;
      const course = await Course.findById(courseId);
      if (!course) {
        res.status(404).json({ success: false, message: 'Course not found' });
        return;
      }
      
      // Check if already enrolled
      const existing = await Enrollment.findOne({ user: userId, course: courseId });
      if (existing) {
        res.status(400).json({ success: false, message: 'Already enrolled' });
        return;
      }
      
      // Check premium requirement for paid courses
      if (course.price > 0) {
        const user = await User.findById(userId);
        const isPremium = user?.subscriptionTier === 'premium' && user?.subscriptionStatus === 'active';
        const isAdmin = user?.roles?.includes('admin');
        if (!isPremium && !isAdmin) {
          res.status(403).json({ success: false, message: 'Premium subscription required for this course' });
          return;
        }
      }
      
      const enrollment = new Enrollment({
        user: userId,
        course: courseId,
        paymentMethod: course.price === 0 ? 'free' : 'paystack',
        amountPaid: course.price,
        currency: 'NGN',
      });
      await enrollment.save();
      await User.findByIdAndUpdate(userId, { $addToSet: { coursesEnrolled: courseId } });
      
      // Update course stats
      course.enrollmentCount += 1;
      course.totalRevenue += course.price;
      await course.save();
      
      res.json({ success: true, data: enrollment, message: 'Enrolled successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  };
}
