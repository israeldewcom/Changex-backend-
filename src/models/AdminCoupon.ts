// File: src/models/AdminCoupon.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminCoupon extends Document {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  usageLimit: number;
  usedCount: number;
  validUntil?: Date;
  createdAt: Date;
}

const AdminCouponSchema = new Schema<IAdminCoupon>(
  {
    code: { type: String, unique: true, required: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true },
    usageLimit: { type: Number, default: 0 },
    usedCount: { type: Number, default: 0 },
    validUntil: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IAdminCoupon>('AdminCoupon', AdminCouponSchema);
