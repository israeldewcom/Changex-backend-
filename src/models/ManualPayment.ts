import mongoose, { Schema, Document } from 'mongoose';

export interface IManualPayment extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'course' | 'subscription' | 'book';
  courseId?: mongoose.Types.ObjectId;
  amount: number;
  reference: string;
  paymentDate: Date;
  receiptUrl: string;
  status: 'pending_review' | 'approved' | 'rejected';
  adminNote?: string;
  autoDetected: boolean;
  rejectionReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  metadata?: Record<string, any>; // ✅ Added for courseId, bookId, etc.
  createdAt: Date;
  updatedAt: Date;
}

const ManualPaymentSchema = new Schema<IManualPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['course', 'subscription', 'book'], required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    paymentDate: { type: Date, required: true },
    receiptUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
    },
    adminNote: String,
    autoDetected: { type: Boolean, default: false },
    rejectionReason: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    metadata: { type: Schema.Types.Mixed, default: {} }, // ✅ Added
  },
  { timestamps: true }
);

ManualPaymentSchema.index({ userId: 1, status: 1 });
ManualPaymentSchema.index({ reference: 1 });
ManualPaymentSchema.index({ createdAt: -1 });

export default mongoose.model<IManualPayment>('ManualPayment', ManualPaymentSchema);
