import mongoose, { Schema, Document } from 'mongoose';

export interface ILesson extends Document {
  courseId: mongoose.Types.ObjectId;
  title: string;
  type: 'video' | 'text' | 'quiz' | 'assignment';
  content?: string;
  videoUrl?: string;
  duration: number;
  order: number;
  xpReward: number;
  resources: { title: string; url: string }[];
  notes?: string;
  // NEW FIELDS:
  hasCodeEditor?: boolean;
  initialCode?: string;
  hasCalculator?: boolean;
  calculatorConfig?: {
    theme: 'light' | 'dark';
    operations: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['video', 'text', 'quiz', 'assignment'], required: true },
    content: String,
    videoUrl: String,
    duration: { type: Number, default: 0 },
    order: { type: Number, required: true },
    xpReward: { type: Number, default: 50 },
    resources: [{ title: String, url: String }],
    notes: String,
    // NEW FIELDS:
    hasCodeEditor: { type: Boolean, default: false },
    initialCode: { type: String, default: '' },
    hasCalculator: { type: Boolean, default: false },
    calculatorConfig: { type: Object, default: { theme: 'dark', operations: ['+', '-', '*', '/'] } },
  },
  { timestamps: true }
);

LessonSchema.index({ courseId: 1, order: 1 });

export default mongoose.model<ILesson>('Lesson', LessonSchema);
