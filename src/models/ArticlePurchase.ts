import mongoose, { Schema, Document } from 'mongoose';

export interface IArticlePurchase extends Document {
  userId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ArticlePurchaseSchema = new Schema<IArticlePurchase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    completedAt: Date,
  },
  { timestamps: true }
);

ArticlePurchaseSchema.index({ userId: 1, postId: 1 }, { unique: true });
ArticlePurchaseSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IArticlePurchase>('ArticlePurchase', ArticlePurchaseSchema);
