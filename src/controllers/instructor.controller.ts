import { Request, Response, NextFunction } from 'express';
import Course from '../models/Course.js';
import Lesson from '../models/Lesson.js';
import Enrollment from '../models/Enrollment.js';
import Question from '../models/Question.js';
import Notification from '../models/Notification.js';
import { IUser } from '../models/User.js';
import { sanitizeHtml } from '../middlewares/sanitize.js';
import cloudinary from '../config/cloudinary.js';
import { getIO } from '../socket.js';
import { uploadToCloudinary } from '../services/cloudinary.js'; // ✅ already exists

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courses = await Course.find({ instructorId: user._id }).lean();
    const courseIds = courses.map(c => c._id);
    const totalStudents = await Enrollment.countDocuments({ courseId: { $in: courseIds } });
    const totalRevenue = courses.reduce((acc, c) => acc + (c.price || 0) * (c.totalStudents || 0), 0);
    const pendingQuestions = await Question.countDocuments({ courseId: { $in: courseIds }, answer: null });
    res.json({ success: true, data: { courses, totalStudents, totalRevenue, pendingQuestions } });
  } catch (err) { next(err); }
};

export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    const { lessons, quizzes, ...courseData } = req.body;
    const slug = generateSlug(courseData.title || 'untitled');
    const course = await Course.create({
      ...courseData,
      instructorId: user._id,
      description: sanitizeHtml(courseData.description || ''),
      slug,
      quizzes: quizzes || [],
      approvalStatus: 'draft'
    });
    if (lessons && Array.isArray(lessons) && lessons.length > 0) {
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        await Lesson.create({
          ...lesson,
          courseId: course._id,
          order: i + 1,
          content: lesson.content || '',
          videoUrl: lesson.videoUrl || '',
          resources: lesson.resources || []
        });
      }
      await Course.findByIdAndUpdate(course._id, { totalLessons: lessons.length });
    }
    res.status(201).json({ success: true, data: course });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(400).json({ success: false, message: 'A course with a similar title already exists. Please change the title.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { lessons, quizzes, ...updateData } = req.body;
    let slug: string | undefined;
    if (updateData.title) {
      slug = generateSlug(updateData.title);
    }

    const course = await Course.findOne({ _id: req.params.id, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const wasApproved = course.approvalStatus === 'approved';
    const updatePayload: any = { ...updateData, description: sanitizeHtml(updateData.description || ''), slug };
    if (wasApproved) {
      updatePayload.approvalStatus = 'pending';
    }

    if (quizzes && Array.isArray(quizzes)) {
      updatePayload.quizzes = quizzes;
    }

    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
    if (!updatedCourse) return res.status(404).json({ success: false, message: 'Course not found' });

    if (lessons && Array.isArray(lessons)) {
      await Lesson.deleteMany({ courseId: updatedCourse._id });
      for (let i = 0; i < lessons.length; i++) {
        await Lesson.create({ ...lessons[i], courseId: updatedCourse._id, order: i + 1 });
      }
      await Course.findByIdAndUpdate(updatedCourse._id, { totalLessons: lessons.length });
    }

    res.json({ success: true, data: updatedCourse });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(400).json({ success: false, message: 'A course with a similar title already exists. Please change the title.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

export const saveDraft = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { id } = req.params;
    const { lessons, quizzes, ...courseData } = req.body;

    let course = await Course.findOne({ _id: id, instructorId: user._id });
    if (!course) {
      const slug = generateSlug(courseData.title || 'untitled');
      course = new Course({
        ...courseData,
        instructorId: user._id,
        description: sanitizeHtml(courseData.description || ''),
        slug,
        quizzes: quizzes || [],
        approvalStatus: 'draft',
        isPublished: false
      });
      await course.save();
    } else {
      if (course.approvalStatus === 'approved') {
        course.approvalStatus = 'pending';
      }
      Object.assign(course, courseData);
      course.description = sanitizeHtml(courseData.description || course.description);
      if (courseData.title) {
        course.slug = generateSlug(courseData.title);
      }
      if (quizzes && Array.isArray(quizzes)) {
        course.quizzes = quizzes;
      }
      await course.save();
    }

    if (lessons && Array.isArray(lessons)) {
      await Lesson.deleteMany({ courseId: course._id });
      for (let i = 0; i < lessons.length; i++) {
        await Lesson.create({ ...lessons[i], courseId: course._id, order: i + 1 });
      }
      course.totalLessons = lessons.length;
      await course.save();
    }

    res.json({ success: true, data: course, message: 'Draft saved successfully' });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(400).json({ success: false, message: 'A course with a similar title already exists. Please change the title.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

export const submitForReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.id, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lessonCount = await Lesson.countDocuments({ courseId: course._id });
    if (lessonCount < 20) return res.status(400).json({ success: false, message: 'Need at least 20 lessons' });
    if (!course.title || !course.description) return res.status(400).json({ success: false, message: 'Title and description required' });
    course.approvalStatus = 'pending';
    await course.save();
    res.json({ success: true, message: 'Submitted for review' });
  } catch (err) { next(err); }
};

export const createLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.create({ ...req.body, courseId: course._id });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: 1 } });
    res.status(201).json({ success: true, data: lesson });
  } catch (err) { next(err); }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.findOneAndUpdate({ _id: req.params.lessonId, courseId: course._id }, req.body, { new: true });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    res.json({ success: true, data: lesson });
  } catch (err) { next(err); }
};

export const deleteLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const lesson = await Lesson.findOneAndDelete({ _id: req.params.lessonId, courseId: course._id });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: -1 } });
    res.json({ success: true, message: 'Lesson deleted' });
  } catch (err) { next(err); }
};

export const uploadMedia = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `courses/${courseId}/media`, resource_type: 'auto' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      uploadStream.end(req.file!.buffer);
    });
    res.json({ success: true, data: { url: (result as any).secure_url, publicId: (result as any).public_id } });
  } catch (err) { next(err); }
};

export const getCourseQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const questions = await Question.find({ courseId: req.params.courseId }).populate('userId', 'firstName lastName').sort('-createdAt');
    res.json({ success: true, data: questions });
  } catch (err) { next(err); }
};

export const answerQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: question.courseId, instructorId: user._id });
    if (!course && !user.roles.includes('admin')) return res.status(403).json({ success: false, message: 'Not authorized' });
    question.answer = answer;
    question.answeredAt = new Date();
    await question.save();
    await Notification.create({ userId: question.userId, title: 'Your question was answered', message: answer.substring(0, 100), type: 'course' });
    getIO().to(`user:${question.userId}`).emit('notification', { title: 'Question answered' });
    res.json({ success: true, message: 'Answer posted' });
  } catch (err) { next(err); }
};

export const uploadCertificateTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: `certificates/templates/${courseId}`, resource_type: 'image' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      uploadStream.end(req.file!.buffer);
    });
    course.certificateTemplate = (result as any).secure_url;
    await course.save();
    res.json({ success: true, data: { url: (result as any).secure_url } });
  } catch (err) { next(err); }
};

// ========== NEW: Course Thumbnail Upload ==========
export const uploadCourseThumbnail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, `courses/${courseId}/thumbnail`, {
      transformation: [{ width: 1280, height: 720, crop: 'fill', quality: 'auto' }]
    });
    course.thumbnail = result.secure_url;
    await course.save();
    res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) {
    next(err);
  }
};

// ========== NEW: Lesson Content Image Upload (for Quill editor) ==========
export const uploadLessonImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId, lessonId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const lesson = await Lesson.findOne({ _id: lessonId, courseId: course._id });
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const result = await uploadToCloudinary(req.file.buffer, `courses/${courseId}/lessons/${lessonId}/images`, {
      transformation: [{ width: 800, quality: 'auto', fetch_format: 'auto' }]
    });
    res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) {
    next(err);
  }
};
