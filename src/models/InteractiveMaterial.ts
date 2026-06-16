import mongoose, { Schema, Document } from 'mongoose';

export interface IInteractiveMaterial extends Document {
  lessonId: mongoose.Types.ObjectId;
  type: 'code_editor' | 'calculator' | 'quiz' | 'diagram' | 'simulation';
  config: any;
  html?: string;
  css?: string;
  js?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const InteractiveMaterialSchema = new Schema<IInteractiveMaterial>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    type: { type: String, enum: ['code_editor', 'calculator', 'quiz', 'diagram', 'simulation'], required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    html: String,
    css: String,
    js: String,
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

InteractiveMaterialSchema.index({ lessonId: 1, order: 1 });

export default mongoose.model<IInteractiveMaterial>('InteractiveMaterial', InteractiveMaterialSchema);
