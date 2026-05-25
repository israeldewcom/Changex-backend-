// ============================================
// FILE: src/models/AffiliateClick.ts (New – tracks clicks)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IAffiliateClick extends Document {
  affiliateId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  code: string;
  ip: string;
  userAgent: string;
  clickedAt: Date;
  createdAt: Date;
}

const AffiliateClickSchema = new Schema<IAffiliateClick>(
  {
    affiliateId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    code: { type: String, required: true, index: true },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    clickedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AffiliateClickSchema.index({ affiliateId: 1, courseId: 1, code: 1 });
AffiliateClickSchema.index({ clickedAt: -1 });

export const AffiliateClick = mongoose.model<IAffiliateClick>('AffiliateClick', AffiliateClickSchema);
