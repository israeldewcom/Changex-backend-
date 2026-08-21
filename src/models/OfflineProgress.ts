// ============================================================
// FILE: src/models/OfflineProgress.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IOfflineProgress extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  progress: number;
  completed: boolean;
  lastUpdated: Date;
  createdAt: Date;
}

const OfflineProgressSchema = new Schema<IOfflineProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    progress: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

OfflineProgressSchema.index({ userId: 1, courseId: 1, lessonId: 1 }, { unique: true });
OfflineProgressSchema.index({ userId: 1, lastUpdated: -1 });

export default mongoose.model<IOfflineProgress>('OfflineProgress', OfflineProgressSchema);
