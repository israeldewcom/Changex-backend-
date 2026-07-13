// ============================================================
// FILE: src/models/ArticlePurchase.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IArticlePurchase extends Document {
  userId: mongoose.Types.ObjectId;
  articleId: mongoose.Types.ObjectId;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ArticlePurchaseSchema = new Schema<IArticlePurchase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    completedAt: Date,
  },
  { timestamps: true }
);

ArticlePurchaseSchema.index({ userId: 1, articleId: 1 }, { unique: true });
ArticlePurchaseSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IArticlePurchase>('ArticlePurchase', ArticlePurchaseSchema);
