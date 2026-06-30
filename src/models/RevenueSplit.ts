import mongoose, { Schema, Document } from 'mongoose';

export interface IRevenueSplit extends Document {
  courseId: mongoose.Types.ObjectId;
  instructorId: mongoose.Types.ObjectId;
  percentage: number;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueSplitSchema = new Schema<IRevenueSplit>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    percentage: { type: Number, min: 0, max: 100, required: true },
  },
  { timestamps: true }
);

RevenueSplitSchema.index({ courseId: 1, instructorId: 1 }, { unique: true });

export default mongoose.model<IRevenueSplit>('RevenueSplit', RevenueSplitSchema);
