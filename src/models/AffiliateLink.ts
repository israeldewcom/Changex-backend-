// File: src/models/AffiliateLink.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAffiliateLink extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  code: string;
  clicks: number;
  conversions: number;
  totalEarned: number;
  createdAt: Date;
}

const AffiliateLinkSchema = new Schema<IAffiliateLink>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    code: { type: String, unique: true, required: true },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AffiliateLinkSchema.index({ code: 1 });

export default mongoose.model<IAffiliateLink>('AffiliateLink', AffiliateLinkSchema);
