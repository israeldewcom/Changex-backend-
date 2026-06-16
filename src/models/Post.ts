import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  type: 'article' | 'tutorial' | 'challenge' | 'announcement';
  authorId: mongoose.Types.ObjectId;
  courseId?: mongoose.Types.ObjectId;
  featuredImage?: string;
  tags: string[];
  views: number;
  likes: number;
  commentsCount: number;
  shares: number;
  earnings: number;
  isPublished: boolean;
  publishedAt?: Date;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    excerpt: String,
    type: { type: String, enum: ['article', 'tutorial', 'challenge', 'announcement'], default: 'article' },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    featuredImage: String,
    tags: [String],
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    seoTitle: String,
    seoDescription: String,
    seoKeywords: String,
  },
  { timestamps: true }
);

PostSchema.index({ slug: 1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ createdAt: -1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ type: 1, isPublished: 1 });

export default mongoose.model<IPost>('Post', PostSchema);
