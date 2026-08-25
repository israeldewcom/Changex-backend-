// ============================================================
// FILE: src/models/GroupPost.ts (NEW)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupPost extends Document {
  groupId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  content: string;
  media: string[];
  linkPreview?: {
    title?: string;
    description?: string;
    image?: string;
    url: string;
  };
  isPinned: boolean;
  isAnnouncement: boolean;
  isPublished: boolean;
  likes: number;
  comments: number;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

const GroupPostSchema = new Schema<IGroupPost>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    media: [String],
    linkPreview: {
      title: String,
      description: String,
      image: String,
      url: String,
    },
    isPinned: { type: Boolean, default: false },
    isAnnouncement: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

GroupPostSchema.index({ groupId: 1, isPinned: -1, createdAt: -1 });
export default mongoose.model<IGroupPost>('GroupPost', GroupPostSchema);
