// ============================================
// FILE: src/models/Post.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IPost extends Document {
  author: mongoose.Types.ObjectId;
  content: string;
  media: string[];
  type: 'text' | 'image' | 'video' | 'link';
  linkPreview?: {
    title: string;
    description: string;
    image: string;
    url: string;
  };
  tags: string[];
  likes: mongoose.Types.ObjectId[];
  likesCount: number;
  comments: mongoose.Types.ObjectId[];
  commentsCount: number;
  shares: number;
  isPinned: boolean;
  isHidden: boolean;
  visibility: 'public' | 'followers' | 'only-me';
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment extends Document {
  post: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  parentComment?: mongoose.Types.ObjectId;
  content: string;
  likes: mongoose.Types.ObjectId[];
  likesCount: number;
  replies: mongoose.Types.ObjectId[];
  repliesCount: number;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, maxlength: 5000 },
    media: [{ type: String }],
    type: { type: String, enum: ['text', 'image', 'video', 'link'], default: 'text' },
    linkPreview: {
      title: { type: String },
      description: { type: String },
      image: { type: String },
      url: { type: String },
    },
    tags: [{ type: String, index: true }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likesCount: { type: Number, default: 0 },
    comments: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
    commentsCount: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    visibility: { type: String, enum: ['public', 'followers', 'only-me'], default: 'public' },
  },
  { timestamps: true }
);

const CommentSchema = new Schema<IComment>(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentComment: { type: Schema.Types.ObjectId, ref: 'Comment' },
    content: { type: String, required: true, maxlength: 2000 },
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likesCount: { type: Number, default: 0 },
    replies: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
    repliesCount: { type: Number, default: 0 },
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PostSchema.index({ createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ tags: 1, createdAt: -1 });
PostSchema.index({ visibility: 1, createdAt: -1 });
CommentSchema.index({ post: 1, createdAt: 1 });
CommentSchema.index({ parentComment: 1 });

export const Post = mongoose.model<IPost>('Post', PostSchema);
export const Comment = mongoose.model<IComment>('Comment', CommentSchema);
