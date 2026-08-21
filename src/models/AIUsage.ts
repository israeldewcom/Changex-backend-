// ============================================================
// FILE: src/models/AIUsage.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAIUsage extends Document {
  userId: mongoose.Types.ObjectId;
  action: 'chat' | 'explain' | 'quiz' | 'practice' | 'feedback' | 'upload';
  tokensUsed: number;
  cost?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AIUsageSchema = new Schema<IAIUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['chat', 'explain', 'quiz', 'practice', 'feedback', 'upload'],
      required: true,
    },
    tokensUsed: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    metadata: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AIUsageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IAIUsage>('AIUsage', AIUsageSchema);
