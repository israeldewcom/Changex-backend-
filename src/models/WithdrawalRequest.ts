// src/models/WithdrawalRequest.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IWithdrawalRequest extends Document {
  user: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    bankCode: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionId?: mongoose.Types.ObjectId;
  adminNotes?: string;
  processedAt?: Date;
  processedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 1000 },
  currency: { type: String, default: 'NGN' },
  bankDetails: {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    bankCode: { type: String, required: true },
  },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  adminNotes: { type: String },
  processedAt: { type: Date },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const WithdrawalRequest = mongoose.model<IWithdrawalRequest>('WithdrawalRequest', WithdrawalRequestSchema);
