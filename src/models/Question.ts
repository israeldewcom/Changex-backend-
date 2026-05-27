// src/models/Question.ts
import mongoose, { Schema, Document } from 'mongoose';
export interface IQuestion extends Document {
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  lessonId?: mongoose.Types.ObjectId;
  question: string;
  answer?: string;
  answeredAt?: Date;
}
const QuestionSchema = new Schema<IQuestion>({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
  question: { type: String, required: true },
  answer: String,
  answeredAt: Date,
}, { timestamps: true });
export default mongoose.model<IQuestion>('Question', QuestionSchema);
