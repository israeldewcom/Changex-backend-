// ============================================================
// FILE: src/models/XPTransaction.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IXPTransaction extends Document {
  userId: mongoose.Types.ObjectId;
  amount: number;
  source: 'lesson_completed' | 'quiz_completed' | 'project_submitted' | 'course_completed' | 'daily_challenge' | 'weekly_challenge' | 'streak_bonus' | 'community_contribution' | 'helpful_answer' | 'other';
  sourceId?: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const XPTransactionSchema = new Schema<IXPTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    source: {
      type: String,
      enum: ['lesson_completed', 'quiz_completed', 'project_submitted', 'course_completed', 'daily_challenge', 'weekly_challenge', 'streak_bonus', 'community_contribution', 'helpful_answer', 'other'],
      required: true,
    },
    sourceId: String,
    description: { type: String, required: true },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

XPTransactionSchema.index({ userId: 1, createdAt: -1 });
XPTransactionSchema.index({ userId: 1, source: 1 });

export default mongoose.model<IXPTransaction>('XPTransaction', XPTransactionSchema);
