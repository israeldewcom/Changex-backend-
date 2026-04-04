// ============================================
// FILE: src/models/Enrollment.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IEnrollment extends Document {
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  status: 'active' | 'completed' | 'dropped' | 'refunded';
  enrolledAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  progress: number;
  lastAccessedAt: Date;
  lastLessonId?: mongoose.Types.ObjectId;
  lessonsCompleted: mongoose.Types.ObjectId[];
  quizzesCompleted: mongoose.Types.ObjectId[];
  quizScores: Array<{ quizId: mongoose.Types.ObjectId; score: number; passed: boolean }>;
  certificateIssued: boolean;
  certificateId?: string;
  paymentMethod: 'free' | 'stripe' | 'paystack' | 'wallet' | 'referral';
  amountPaid: number;
  currency: string;
  transactionId?: string;
  referralSource?: mongoose.Types.ObjectId;
  completionCertificate?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EnrollmentSchema = new Schema<IEnrollment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    status: { type: String, enum: ['active', 'completed', 'dropped', 'refunded'], default: 'active' },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    expiresAt: { type: Date },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    lastAccessedAt: { type: Date, default: Date.now },
    lastLessonId: { type: Schema.Types.ObjectId },
    lessonsCompleted: [{ type: Schema.Types.ObjectId }],
    quizzesCompleted: [{ type: Schema.Types.ObjectId }],
    quizScores: [{
      quizId: { type: Schema.Types.ObjectId, required: true },
      score: { type: Number, required: true },
      passed: { type: Boolean, required: true },
    }],
    certificateIssued: { type: Boolean, default: false },
    certificateId: { type: String },
    paymentMethod: { type: String, enum: ['free', 'stripe', 'paystack', 'wallet', 'referral'], required: true },
    amountPaid: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN' },
    transactionId: { type: String },
    referralSource: { type: Schema.Types.ObjectId, ref: 'User' },
    completionCertificate: { type: String },
  },
  { timestamps: true }
);

// Compound index for unique enrollment
EnrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
EnrollmentSchema.index({ status: 1, progress: 1 });
EnrollmentSchema.index({ enrolledAt: -1 });

export const Enrollment = mongoose.model<IEnrollment>('Enrollment', EnrollmentSchema);
