// ============================================================
// FILE: src/models/Enrollment.ts (UPDATED)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IEnrollment extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  progress: number;
  status: 'active' | 'completed' | 'dropped';
  startedAt: Date;
  completedAt?: Date;
  cohortId?: mongoose.Types.ObjectId;
  dropoutAt?: Date;
  lastActivityAt?: Date;
  // ─── NEW ACADEMY FIELDS ──────────────────────────────────────
  academyId?: mongoose.Types.ObjectId;
  // ─── NEW LIVE CLASS FIELDS ──────────────────────────────────
  attendance?: Array<{
    sessionId: mongoose.Types.ObjectId;
    attended: boolean;
    attendedAt?: Date;
  }>;
  // ─── NEW OFFLINE FIELDS ──────────────────────────────────────
  offlineProgress?: {
    syncedAt: Date;
    lessonsCompletedOffline: mongoose.Types.ObjectId[];
  };
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    progress: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'dropped'], default: 'active' },
    completedAt: Date,
    cohortId: { type: Schema.Types.ObjectId, ref: 'Cohort' },
    dropoutAt: Date,
    lastActivityAt: { type: Date, default: Date.now },
    // ─── NEW ──────────────────────────────────────────────────────
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy' },
    attendance: [
      {
        sessionId: { type: Schema.Types.ObjectId, ref: 'LiveSession' },
        attended: { type: Boolean, default: false },
        attendedAt: Date,
      },
    ],
    offlineProgress: {
      syncedAt: Date,
      lessonsCompletedOffline: [{ type: Schema.Types.ObjectId, ref: 'Lesson' }],
    },
  },
  { timestamps: { createdAt: 'startedAt', updatedAt: false } }
);

EnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });
EnrollmentSchema.index({ cohortId: 1 });
EnrollmentSchema.index({ status: 1 });
EnrollmentSchema.index({ lastActivityAt: -1 });
EnrollmentSchema.index({ academyId: 1 });

export default mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
