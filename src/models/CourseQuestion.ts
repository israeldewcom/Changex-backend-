// src/models/CourseQuestion.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ICourseQuestion extends Document {
  course: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  question: string;
  answers: mongoose.Types.ObjectId[];
  isAnswered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICourseAnswer extends Document {
  question: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  answer: string;
  isInstructorAnswer: boolean;
  createdAt: Date;
}

const CourseAnswerSchema = new Schema<ICourseAnswer>({
  question: { type: Schema.Types.ObjectId, ref: 'CourseQuestion', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  answer: { type: String, required: true, maxlength: 2000 },
  isInstructorAnswer: { type: Boolean, default: false },
}, { timestamps: true });

const CourseQuestionSchema = new Schema<ICourseQuestion>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  lessonId: { type: Schema.Types.ObjectId, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true, maxlength: 2000 },
  answers: [{ type: Schema.Types.ObjectId, ref: 'CourseAnswer' }],
  isAnswered: { type: Boolean, default: false },
}, { timestamps: true });

export const CourseQuestion = mongoose.model<ICourseQuestion>('CourseQuestion', CourseQuestionSchema);
export const CourseAnswer = mongoose.model<ICourseAnswer>('CourseAnswer', CourseAnswerSchema);
