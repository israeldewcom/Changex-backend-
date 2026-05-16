import mongoose, { Schema, Document } from 'mongoose';

export interface ILesson extends Document {
  title: string;
  description: string;
  type: 'video' | 'text' | 'quiz' | 'code' | 'assignment';
  content: string;
  videoUrl?: string;
  duration: number;
  order: number;
  xpReward: number;
  isFree: boolean;
  resources: Array<{ title: string; url: string }>;
}

export interface IQuiz extends Document {
  title: string;
  questions: Array<{
    question: string;
    type: 'multiple-choice' | 'true-false' | 'code';
    options?: string[];
    correctAnswer: string | string[];
    explanation?: string;
    points: number;
  }>;
  passingScore: number;
  xpReward: number;
}

export interface ICourse extends Document {
  title: string;
  slug: string;
  description: string;
  longDescription: string;
  category: string;
  subcategory: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  price: number;
  discountPrice?: number;
  currency: string;
  thumbnail: string;
  previewVideo?: string;
  instructor: mongoose.Types.ObjectId;
  lessons: ILesson[];
  quizzes: IQuiz[];
  totalDuration: number;
  totalLessons: number;
  totalQuizzes: number;
  xpReward: number;
  certificateTemplate: string;
  requirements: string[];
  objectives: string[];
  targetAudience: string[];
  featured: boolean;
  published: boolean;
  publishedAt?: Date;
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  prerequisites: mongoose.Types.ObjectId[];
  whatYouWillLearn: string[];
  language: string;
  lastUpdated: Date;
  version: number;
  creatorCommission: number;
  affiliateCommission: number;
  platformFee: number;
  totalRevenue: number;
  totalEnrollments: number;
  completionRate: number;
  averageRating: number;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>({
  title: { type: String, required: true },
  description: { type: String, default: 'Lesson description' },   // ✅ default added
  type: { type: String, enum: ['video', 'text', 'quiz', 'code', 'assignment'], required: true },
  content: { type: String, default: '' },                         // ✅ default added
  videoUrl: { type: String },
  duration: { type: Number, required: true },
  order: { type: Number, required: true },
  xpReward: { type: Number, default: 50 },
  isFree: { type: Boolean, default: false },
  resources: [{
    title: { type: String, required: true },
    url: { type: String, required: true },
  }],
});

const QuizQuestionSchema = new Schema({
  question: { type: String, required: true },
  type: { type: String, enum: ['multiple-choice', 'true-false', 'code'], required: true },
  options: [{ type: String }],
  correctAnswer: { type: Schema.Types.Mixed, required: true },
  explanation: { type: String },
  points: { type: Number, default: 10 },
});

const QuizSchema = new Schema<IQuiz>({
  title: { type: String, required: true },
  questions: [QuizQuestionSchema],
  passingScore: { type: Number, required: true, min: 0, max: 100 },
  xpReward: { type: Number, default: 100 },
});

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    longDescription: { type: String, required: true },
    category: { type: String, required: true, index: true },
    subcategory: { type: String },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      required: true,
      set: (val: string) => val.toLowerCase()   // ✅ converts "Beginner" → "beginner"
    },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'NGN' },
    thumbnail: { type: String, required: true },
    previewVideo: { type: String },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lessons: [LessonSchema],
    quizzes: [QuizSchema],
    totalDuration: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    totalQuizzes: { type: Number, default: 0 },
    xpReward: { type: Number, default: 500 },
    certificateTemplate: { type: String },
    requirements: [{ type: String }],
    objectives: [{ type: String }],
    targetAudience: [{ type: String }],
    featured: { type: Boolean, default: false, index: true },
    published: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date },
    enrollmentCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    tags: [{ type: String, index: true }],
    prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    whatYouWillLearn: [{ type: String }],
    language: { type: String, default: 'en' },
    lastUpdated: { type: Date, default: Date.now },
    version: { type: Number, default: 1 },
    creatorCommission: { type: Number, default: 70 },
    affiliateCommission: { type: Number, default: 20 },
    platformFee: { type: Number, default: 10 },
    totalRevenue: { type: Number, default: 0 },
    totalEnrollments: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

CourseSchema.index({ title: 'text', description: 'text', tags: 'text' });
CourseSchema.index({ category: 1, level: 1, price: 1 });
CourseSchema.index({ enrollmentCount: -1 });
CourseSchema.index({ rating: -1 });
CourseSchema.index({ createdAt: -1 });

CourseSchema.pre('save', function(next) {
  this.totalLessons = this.lessons.length;
  this.totalQuizzes = this.quizzes.length;
  this.totalDuration = this.lessons.reduce((sum, lesson) => sum + lesson.duration, 0);
  next();
});

export const Course = mongoose.model<ICourse>('Course', CourseSchema);
