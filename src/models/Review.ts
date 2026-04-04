// ============================================
// FILE: src/models/Review.ts (new model)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  user: mongoose.Types.ObjectId;
  course?: mongoose.Types.ObjectId;
  product?: mongoose.Types.ObjectId;
  rating: number;
  title: string;
  content: string;
  images: string[];
  likes: mongoose.Types.ObjectId[];
  replies: Array<{
    user: mongoose.Types.ObjectId;
    content: string;
    createdAt: Date;
  }>;
  isVerifiedPurchase: boolean;
  isApproved: boolean;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    product: { type: Schema.Types.ObjectId, ref: 'Marketplace', index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 2000 },
    images: [{ type: String }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    replies: [{
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      content: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    isVerifiedPurchase: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ReviewSchema.index({ course: 1, rating: -1 });
ReviewSchema.index({ product: 1, rating: -1 });
ReviewSchema.index({ user: 1, course: 1 }, { unique: true, sparse: true });
ReviewSchema.index({ user: 1, product: 1 }, { unique: true, sparse: true });

export const Review = mongoose.model<IReview>('Review', ReviewSchema);
