// ============================================
// FILE: src/models/Transaction.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: 'deposit' | 'withdrawal' | 'purchase' | 'refund' | 'commission' | 'reward' | 'subscription';
  subtype?: 'course' | 'marketplace' | 'referral' | 'affiliate' | 'lesson_completion' | 'quiz_completion' | 'daily_reward';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  description: string;
  metadata: Record<string, any>;
  reference: string;
  paymentMethod?: 'stripe' | 'paystack' | 'wallet' | 'bank_transfer';
  paymentGatewayReference?: string;
  fromUserId?: mongoose.Types.ObjectId;
  toUserId?: mongoose.Types.ObjectId;
  courseId?: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  withdrawalDetails?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
  };
  processedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'purchase', 'refund', 'commission', 'reward', 'subscription'], required: true },
    subtype: { type: String, enum: ['course', 'marketplace', 'referral', 'affiliate', 'lesson_completion', 'quiz_completion', 'daily_reward'] },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    reference: { type: String, required: true, unique: true },
    paymentMethod: { type: String, enum: ['stripe', 'paystack', 'wallet', 'bank_transfer'] },
    paymentGatewayReference: { type: String },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    enrollmentId: { type: Schema.Types.ObjectId, ref: 'Enrollment' },
    withdrawalDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountName: { type: String },
      bankCode: { type: String },
    },
    processedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
TransactionSchema.index({ reference: 1 }, { unique: true });
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, type: 1 });
TransactionSchema.index({ createdAt: -1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
