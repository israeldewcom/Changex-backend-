import mongoose, { Schema, Document } from 'mongoose';

export interface ILessonInteraction extends Document {
  lessonId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: 'code' | 'calculator' | 'quiz' | 'assignment';
  content: any;
  savedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LessonInteractionSchema = new Schema<ILessonInteraction>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['code', 'calculator', 'quiz', 'assignment'], required: true },
    content: { type: Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

LessonInteractionSchema.index({ lessonId: 1, userId: 1, type: 1 }, { unique: true });

export default mongoose.model<ILessonInteraction>('LessonInteraction', LessonInteractionSchema);
