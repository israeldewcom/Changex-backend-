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
import { uploadToCloudinary } from '../services/cloudinary.js';
import mongoose from 'mongoose';
import Rating from '../models/Rating.js';
import Transaction from '../models/Transaction.js';
import { invalidateCache } from '../services/cache.js';

// ─── Cache invalidation helper ──────────────────────────────────
// getCourse (course.controller.ts) caches the full course + lessons
// payload for 2 hours per course ID, shared across every viewer. None of
// the instructor write paths below (saveDraft, submitForReview,
// createLesson, updateLesson, deleteLesson) ever invalidated that cache
// after changing course/lesson data. Concretely, this is why students
// could keep seeing empty lesson content for up to 2 hours after an
// instructor fixed and re-saved it: the database had the correct content,
// but /courses/:id kept serving the stale cached snapshot taken before
// the fix. Every write path that touches a course's lessons or metadata
// must clear both this course's single-course cache entry and the
// courses-list cache, so the very next viewer (student or otherwise)
// gets fresh data instead of whatever was cached hours earlier.
async function invalidateCourseCache(courseId: string) {
  await invalidateCache(`course:${courseId}`);
  await invalidateCache('courses:*');
}

// ✅ FIXED: Slug generation with timestamp – prevents duplicate title errors
function generateSlug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base}-${Date.now().toString(36)}`;
}

export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const courses = await Course.find({ instructorId: user._id }).lean();
    const courseIds = courses.map(c => c._id);

    // Total students
    const totalStudents = await Enrollment.countDocuments({ courseId: { $in: courseIds } });

    // Total revenue
    const revenueAgg = await Transaction.aggregate([
      { $match: { 'metadata.courseId': { $in: courseIds }, type: 'course_purchase', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // Pending questions
    const pendingQuestions = await Question.countDocuments({ courseId: { $in: courseIds }, answer: null });

    // Average rating per course
    const ratingAgg = await Rating.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', avg: { $avg: '$rating' } } }
    ]);
    const ratingsMap = ratingAgg.reduce((acc, r) => { acc[r._id.toString()] = r.avg; return acc; }, {});

    const coursesWithRating = courses.map(c => ({
      ...c,
      avgRating: ratingsMap[c._id.toString()] || 0,
    }));

    res.json({ success: true, data: { courses: coursesWithRating, totalStudents, totalRevenue, pendingQuestions } });
  } catch (err) { next(err); }
};

export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

    if (!user.roles.includes('instructor') && !user.roles.includes('admin') && !user.isApprovedInstructor) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

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
      const lessonDocs = lessons.map((lesson: any, i: number) => ({
        ...lesson,
        courseId: course._id,
        order: i + 1,
        content: lesson.content || '',
        videoUrl: lesson.videoUrl || '',
        resources: lesson.resources || []
      }));
      await Lesson.insertMany(lessonDocs);
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
    if (updateData.title) slug = generateSlug(updateData.title);

    const course = await Course.findOne({ _id: req.params.id, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const wasApproved = course.approvalStatus === 'approved';
    const updatePayload: any = { ...updateData, description: sanitizeHtml(updateData.description || ''), slug };
    if (wasApproved) updatePayload.approvalStatus = 'pending';

    if (quizzes && Array.isArray(quizzes)) updatePayload.quizzes = quizzes;

    const updatedCourse = await Course.findByIdAndUpdate(req.params.id, updatePayload, { new: true });
    if (!updatedCourse) return res.status(404).json({ success: false, message: 'Course not found' });

    if (lessons && Array.isArray(lessons)) {
      await Lesson.deleteMany({ courseId: updatedCourse._id });
      const lessonDocs = lessons.map((l: any, i: number) => ({ ...l, courseId: updatedCourse._id, order: i + 1 }));
      await Lesson.insertMany(lessonDocs);
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

    if (!user.roles.includes('instructor') && !user.roles.includes('admin') && !user.isApprovedInstructor) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

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
      // ─── Guard against clobbering real content with a blank re-save ──
      // This endpoint fully deletes and reinserts every lesson on every
      // save (delete-then-insertMany below), trusting whatever the client
      // sends as the full source of truth. That's fine when the client is
      // sending a complete, correct picture — but a client-side bug (a
      // stale rich-text editor instance, a race in re-rendering the
      // content step, a page that only partially loaded existing lessons
      // before saving) can send lessons with empty content/videoUrl even
      // though real content already exists in the database for them. That
      // silently destroys real content with no error and no trace of what
      // was lost.
      //
      // Before deleting anything, compare against what's currently stored.
      // If a lesson that already has real saved content would be
      // overwritten by an incoming lesson with no content and no video
      // (matched by position, matching the existing insertMany/order
      // behavior below since these lessons have no stable client-side id),
      // refuse the whole draft save and tell the caller which lesson
      // indexes are at risk, rather than 500ing or silently proceeding.
      // This does not block legitimate edits — only the empty-over-real
      // pattern that indicates a client bug, not an intentional clear.
      const existingLessons = await Lesson.find({ courseId: course._id }).sort('order').lean();
      const isBlank = (val: unknown) => {
        if (!val) return true;
        const stripped = String(val).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
        return stripped === '' || stripped === '<p><br></p>';
      };
      const wouldClobber: number[] = [];
      lessons.forEach((l: any, i: number) => {
        const existing = existingLessons[i];
        if (!existing) return; // new lesson, nothing to clobber
        const existingHasContent = !isBlank(existing.content) || !isBlank(existing.videoUrl);
        const incomingHasContent = !isBlank(l.content) || !isBlank(l.videoUrl);
        if (existingHasContent && !incomingHasContent) {
          wouldClobber.push(i + 1); // 1-indexed for a human-readable message
        }
      });

      if (wouldClobber.length > 0) {
        return res.status(409).json({
          success: false,
          message: `Refusing to save: lesson(s) ${wouldClobber.join(', ')} already have content saved, but this save would replace them with empty content. If you intended to clear these lessons, edit and re-save just those lessons individually.`,
          data: { lessonsAtRisk: wouldClobber }
        });
      }

      await Lesson.deleteMany({ courseId: course._id });
      if (lessons.length > 0) {
        const lessonDocs = lessons.map((l: any, i: number) => ({
          ...l,
          courseId: course._id,
          order: i + 1,
          content: l.content || '',
          videoUrl: l.videoUrl || '',
          resources: l.resources || []
        }));
        await Lesson.insertMany(lessonDocs);
      }
      course.totalLessons = lessons.length;
      await course.save();
    }

    // ─── Invalidate the course cache ────────────────────────────────
    // Without this, students hitting GET /courses/:id keep getting the
    // stale cached lessons (possibly with empty content, from before this
    // save) for up to 2 hours — even though the database now has the
    // correct, just-saved data. See invalidateCourseCache's definition
    // above for the full explanation.
    await invalidateCourseCache(course._id.toString());

    res.json({ success: true, data: course, message: 'Draft saved successfully' });
  } catch (err: any) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      return res.status(400).json({ success: false, message: 'A course with a similar title already exists. Please change the title.' });
    }
    console.error('Save draft error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to save draft' });
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

    // Keep totalLessons in sync with the real count at the moment of submission,
    // so approved courses can never display a stale/zero lesson count.
    course.totalLessons = lessonCount;
    course.approvalStatus = 'pending';
    await course.save();
    await invalidateCourseCache(course._id.toString());
    res.json({ success: true, message: 'Submitted for review' });
  } catch (err) { next(err); }
};

export const deleteCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.id, instructorId: user._id });
    if (!course && !user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    await Lesson.deleteMany({ courseId: course._id });
    await Enrollment.deleteMany({ courseId: course._id });
    await course.deleteOne();
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) { next(err); }
};

export const createLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lesson = await Lesson.create({ ...req.body, courseId: course._id });
    await Course.findByIdAndUpdate(course._id, { $inc: { totalLessons: 1 } });
    await invalidateCourseCache(course._id.toString());
    res.status(201).json({ success: true, data: lesson });
  } catch (err) { next(err); }
};

export const updateLesson = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const course = await Course.findOne({ _id: req.params.courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lesson = await Lesson.findOneAndUpdate(
      { _id: req.params.lessonId, courseId: course._id },
      req.body,
      { new: true }
    );
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    await invalidateCourseCache(course._id.toString());
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
    await invalidateCourseCache(course._id.toString());
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
    const questions = await Question.find({ courseId: req.params.courseId })
      .populate('userId', 'firstName lastName')
      .sort('-createdAt');
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
    if (!course && !user.roles.includes('admin')) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    question.answer = answer;
    question.answeredAt = new Date();
    await question.save();

    await Notification.create({
      userId: question.userId,
      title: 'Your question was answered',
      message: answer.substring(0, 100),
      type: 'course'
    });
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

export const uploadCourseThumbnail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (!req.file) return res.status(400).json({ success: false, message: 'No image file uploaded' });

    const result = await uploadToCloudinary(req.file.buffer, `courses/${courseId}/thumbnail`, {
      transformation: [{ width: 1280, height: 720, crop: 'fill', quality: 'auto' }]
    });
    course.thumbnail = result.secure_url;
    await course.save();
    res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) { next(err); }
};

export const uploadLessonImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { courseId, lessonId } = req.params;
    const course = await Course.findOne({ _id: courseId, instructorId: user._id });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const lesson = await Lesson.findOne({ _id: lessonId, courseId: course._id });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    if (!req.file) return res.status(400).json({ success: false, message: 'No image file uploaded' });

    const result = await uploadToCloudinary(req.file.buffer, `courses/${courseId}/lessons/${lessonId}/images`, {
      transformation: [{ width: 800, quality: 'auto', fetch_format: 'auto' }]
    });
    res.json({ success: true, data: { url: result.secure_url, publicId: result.public_id } });
  } catch (err) { next(err); }
};
