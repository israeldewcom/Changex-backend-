// ============================================================
// FILE: src/models/Ad.ts (UPDATED – full enum for all placements)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAd extends Document {
  title: string;
  imageUrl: string;
  linkUrl: string;
  placement: 
    | 'sidebar'
    | 'banner'
    | 'in-feed'
    | 'popup'
    | 'book-page'
    | 'video-pre'
    | 'video-mid'
    | 'lesson-inline'
    | 'challenge-sponsor'
    | 'book-sponsor'
    | 'explore-sponsor';
  startDate: Date;
  endDate: Date;
  impressions: number;
  clicks: number;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdSchema = new Schema<IAd>(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, required: true },
    placement: {
      type: String,
      enum: [
        'sidebar',
        'banner',
        'in-feed',
        'popup',
        'book-page',
        'video-pre',
        'video-mid',
        'lesson-inline',
        'challenge-sponsor',
        'book-sponsor',
        'explore-sponsor'
      ],
      required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

AdSchema.index({ placement: 1, isActive: 1, startDate: 1, endDate: 1 });

export default mongoose.model<IAd>('Ad', AdSchema);
