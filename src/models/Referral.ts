// ============================================
// FILE: src/models/Referral.ts (Ensure it exists)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId;
  referred: mongoose.Types.ObjectId;
  level: number;
  status: 'pending' | 'active' | 'completed' | 'expired';
  referralCode: string;
  clickedAt?: Date;
  registeredAt?: Date;
  firstPurchaseAt?: Date;
  totalCommission: number;
  commissions: Array<{
    amount: number;
    type: string;
    transactionId: mongoose.Types.ObjectId;
    createdAt: Date;
  }>;
  expiresAt: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referred: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    level: { type: Number, required: true, min: 1, max: 3, default: 1 },
    status: { type: String, enum: ['pending', 'active', 'completed', 'expired'], default: 'pending' },
    referralCode: { type: String, required: true, index: true },
    clickedAt: { type: Date },
    registeredAt: { type: Date },
    firstPurchaseAt: { type: Date },
    totalCommission: { type: Number, default: 0 },
    commissions: [{
      amount: { type: Number, required: true },
      type: { type: String, required: true },
      transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

ReferralSchema.index({ referrer: 1, level: 1 });
ReferralSchema.index({ expiresAt: 1 });

export const Referral = mongoose.model<IReferral>('Referral', ReferralSchema);
