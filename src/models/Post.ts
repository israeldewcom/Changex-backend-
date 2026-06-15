import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
  title: string;
  content: string;
  excerpt?: string;
  featuredImage?: string;
  authorId: mongoose.Types.ObjectId;
  status: 'draft' | 'published' | 'archived';
  category: 'tutorial' | 'article' | 'project' | 'challenge';
  tags: string[];
  likes: number;
  comments: number;
  shares: number;
  views: number;
  earnings: number;
  isMonetized: boolean;
  uniqueSlug: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

const PostSchema = new Schema<IPost>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    excerpt: String,
    featuredImage: String,
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    category: { type: String, enum: ['tutorial', 'article', 'project', 'challenge'], default: 'article' },
    tags: [String],
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    isMonetized: { type: Boolean, default: false },
    uniqueSlug: { type: String, unique: true, required: true },
    publishedAt: Date,
  },
  { timestamps: true }
);

PostSchema.index({ uniqueSlug: 1 });
PostSchema.index({ authorId: 1, createdAt: -1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ status: 1, publishedAt: -1 });

export default mongoose.model<IPost>('Post', PostSchema);
