// ============================================================
// FILE: src/models/GroupLike.ts (NEW)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupLike extends Document {
  userId: mongoose.Types.ObjectId;
  targetId: mongoose.Types.ObjectId;
  targetType: 'post' | 'comment';
  createdAt: Date;
}

const GroupLikeSchema = new Schema<IGroupLike>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['post', 'comment'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

GroupLikeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });
export default mongoose.model<IGroupLike>('GroupLike', GroupLikeSchema);
