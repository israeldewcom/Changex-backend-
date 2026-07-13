// ============================================================
// FILE: src/models/Article.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IArticle extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage: string;
  tags: string[];
  views: number;
  likes: number;
  commentsCount: number;
  shares: number;
  isPaid: boolean;
  price: number;
  previewContent: string;
  status: 'draft' | 'pending' | 'rejected' | 'published';
  rejectionReason?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  isPublished: boolean;
  publishedAt?: Date;
  seoTitle: string;
  seoDescription: string;
  createdAt: Date;
  updatedAt: Date;
}

const ArticleSchema = new Schema<IArticle>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    excerpt: String,
    featuredImage: String,
    tags: [String],
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: false },
    price: { type: Number, default: 0 },
    previewContent: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'pending', 'rejected', 'published'],
      default: 'draft',
    },
    rejectionReason: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    seoTitle: String,
    seoDescription: String,
  },
  { timestamps: true }
);

ArticleSchema.index({ slug: 1 });
ArticleSchema.index({ status: 1, isPublished: 1 });
ArticleSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IArticle>('Article', ArticleSchema);
