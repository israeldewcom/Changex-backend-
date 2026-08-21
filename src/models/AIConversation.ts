// ============================================================
// FILE: src/models/AIConversation.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAIConversation extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }>;
  context?: {
    courseId?: mongoose.Types.ObjectId;
    lessonId?: mongoose.Types.ObjectId;
    skill?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AIConversationSchema = new Schema<IAIConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: String, required: true, unique: true },
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    context: {
      courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
      lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
      skill: String,
    },
  },
  { timestamps: true }
);

AIConversationSchema.index({ userId: 1, sessionId: 1 });
AIConversationSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model<IAIConversation>('AIConversation', AIConversationSchema);
