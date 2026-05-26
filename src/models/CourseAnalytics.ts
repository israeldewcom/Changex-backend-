// File: src/models/CourseAnalytics.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICourseAnalytics extends Document {
  courseId: mongoose.Types.ObjectId;
  period: string; // e.g. '2025-01'
  enrollments: number;
  completions: number;
  revenue: number;
}

const CourseAnalyticsSchema = new Schema<ICourseAnalytics>({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  period: { type: String, required: true },
  enrollments: { type: Number, default: 0 },
  completions: { type: Number, default: 0 },
  revenue: { type: Number, default: 0 },
});

CourseAnalyticsSchema.index({ courseId: 1, period: 1 }, { unique: true });

export default mongoose.model<ICourseAnalytics>('CourseAnalytics', CourseAnalyticsSchema);
