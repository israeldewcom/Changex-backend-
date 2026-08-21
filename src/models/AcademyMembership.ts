// ============================================================
// FILE: src/models/AcademyMembership.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAcademyMembership extends Document {
  academyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'instructor' | 'moderator' | 'student' | 'finance' | 'content';
  status: 'active' | 'pending' | 'suspended' | 'rejected';
  joinedAt: Date;
  expiresAt?: Date;
  // For student applications
  applicationData?: {
    questions?: Record<string, any>;
    documents?: string[];
  };
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AcademyMembershipSchema = new Schema<IAcademyMembership>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'instructor', 'moderator', 'student', 'finance', 'content'],
      default: 'student',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'suspended', 'rejected'],
      default: 'pending',
    },
    joinedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    applicationData: {
      questions: Schema.Types.Mixed,
      documents: [String],
    },
    adminNote: String,
  },
  { timestamps: true }
);

AcademyMembershipSchema.index({ academyId: 1, userId: 1 }, { unique: true });
AcademyMembershipSchema.index({ academyId: 1, role: 1 });
AcademyMembershipSchema.index({ userId: 1 });

export default mongoose.model<IAcademyMembership>('AcademyMembership', AcademyMembershipSchema);
