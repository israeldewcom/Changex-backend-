// ============================================
// FILE: src/models/AffiliateClick.ts (New)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IAffiliateClick extends Document {
  affiliateLinkId: mongoose.Types.ObjectId;
  affiliateUserId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  ip: string;
  userAgent: string;
  referrer?: string;
  clickedAt: Date;
  converted: boolean;
  conversionAt?: Date;
  transactionId?: mongoose.Types.ObjectId;
}

const AffiliateClickSchema = new Schema<IAffiliateClick>(
  {
    affiliateLinkId: { type: Schema.Types.ObjectId, required: true, index: true },
    affiliateUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    referrer: { type: String },
    clickedAt: { type: Date, default: Date.now },
    converted: { type: Boolean, default: false },
    conversionAt: { type: Date },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { timestamps: true }
);

AffiliateClickSchema.index({ affiliateUserId: 1, courseId: 1, converted: 1 });
AffiliateClickSchema.index({ clickedAt: -1 });

export const AffiliateClick = mongoose.model<IAffiliateClick>('AffiliateClick', AffiliateClickSchema);
