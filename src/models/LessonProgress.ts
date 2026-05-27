// src/models/LessonProgress.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ILessonProgress extends Document {
  enrollmentId: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  completed: boolean;
  timeSpent: number;
}

const LessonProgressSchema = new Schema<ILessonProgress>(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    completed: { type: Boolean, default: false },
    timeSpent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

LessonProgressSchema.index({ enrollmentId: 1, lessonId: 1 }, { unique: true });

export default mongoose.model<ILessonProgress>('LessonProgress', LessonProgressSchema);
