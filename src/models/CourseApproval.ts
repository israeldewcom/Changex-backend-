import mongoose, { Schema, Document } from 'mongoose';

export interface ICourseApproval extends Document {
  course: mongoose.Types.ObjectId;
  instructor: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  adminNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CourseApprovalSchema = new Schema<ICourseApproval>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, unique: true },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String },
    adminNotes: { type: String },
  },
  { timestamps: true }
);

export const CourseApproval = mongoose.model<ICourseApproval>('CourseApproval', CourseApprovalSchema);
