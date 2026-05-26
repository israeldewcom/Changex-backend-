// File: src/models/Rating.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IRating extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  rating: number;
  review?: string;
}

const RatingSchema = new Schema<IRating>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    review: String,
  },
  { timestamps: true }
);

RatingSchema.index({ userId: 1, courseId: 1 }, { unique: true });
RatingSchema.index({ courseId: 1 });

export default mongoose.model<IRating>('Rating', RatingSchema);
