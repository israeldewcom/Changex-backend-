import mongoose, { Schema, Document } from 'mongoose';

export interface ICohort extends Document {
  courseId: mongoose.Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CohortSchema = new Schema<ICohort>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    capacity: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CohortSchema.index({ courseId: 1, startDate: 1 });

export default mongoose.model<ICohort>('Cohort', CohortSchema);
