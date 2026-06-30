// ============================================================
// FILE: src/models/PostAnalytics.ts (UPDATED – added index)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IPostAnalytics extends Document {
  postId: mongoose.Types.ObjectId;
  views: number;
  uniqueViews: number;
  likes: number;
  comments: number;
  shares: number;
  totalEngagement: number;
  earnings: number;
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PostAnalyticsSchema = new Schema<IPostAnalytics>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, unique: true },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    totalEngagement: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PostAnalyticsSchema.index({ totalEngagement: -1 }); // ✅ for social earnings
PostAnalyticsSchema.index({ postId: 1 });

export default mongoose.model<IPostAnalytics>('PostAnalytics', PostAnalyticsSchema);
