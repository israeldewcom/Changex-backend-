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

const LessonSchema = new Schema<ILesson>({
  title: { type: String, required: true },
  description: { type: String, default: 'Lesson description' },
  type: { type: String, enum: ['video', 'text', 'quiz', 'code', 'assignment'], required: true },
  content: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  duration: { type: Number, required: true },
  order: { type: Number, required: true },
  xpReward: { type: Number, default: 50 },
  isFree: { type: Boolean, default: false },
  resources: [{
    title: { type: String, required: true },
    url: { type: String, required: true },
  }],
});

export interface ICourse extends Document {
  title: string;
  slug: string;
  description: string;
  longDescription: string;
  category: string;
  level: string;
  price: number;
  discountPrice?: number;
  thumbnail: string;
  instructor: mongoose.Types.ObjectId;
  lessons: ILesson[];
  published: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  hasAffiliate: boolean;
  affiliateCommission: number;
  totalRevenue: number;
  enrollmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true, default: 'No description provided' },
    longDescription: { type: String, default: 'No description provided' },
    category: { type: String, default: 'Web Development' },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    price: { type: Number, default: 0 },
    discountPrice: { type: Number, default: 0 },
    thumbnail: { type: String, default: '📚' },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lessons: [LessonSchema],
    published: { type: Boolean, default: false },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    hasAffiliate: { type: Boolean, default: false },
    affiliateCommission: { type: Number, default: 20 },
    totalRevenue: { type: Number, default: 0 },
    enrollmentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Course = mongoose.model<ICourse>('Course', CourseSchema);
