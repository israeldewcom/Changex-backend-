import mongoose, { Schema, Document } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  applicableTo: 'all' | 'courses' | 'marketplace' | 'subscription';
  applicableIds?: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, required: true, default: 'Discount coupon' },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    usageLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true, default: Date.now },
    validUntil: { type: Date, required: true },
    applicableTo: { type: String, enum: ['all', 'courses', 'marketplace', 'subscription'], default: 'all' },
    applicableIds: [{ type: Schema.Types.ObjectId, refPath: 'applicableTo' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Coupon = mongoose.model<ICoupon>('Coupon', CouponSchema);
