import mongoose, { Schema, Document } from 'mongoose';

export interface IEnrollment extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  progress: number;
  status: 'active' | 'completed' | 'dropped';
  startedAt: Date;
  completedAt?: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'dropped'], default: 'active' },
    completedAt: Date,
  },
  { timestamps: { createdAt: 'startedAt', updatedAt: false } }
);

// ✅ Ensure compound index with non‑null values (MongoDB will reject null)
EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export default mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
