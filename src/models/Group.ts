// ============================================================
// FILE: src/models/Group.ts (UPDATED)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description: string;
  avatar: string;
  coverImage: string;
  type: 'public' | 'private';
  adminId: mongoose.Types.ObjectId;
  memberCount: number;
  conversationId?: mongoose.Types.ObjectId;
  settings: {
    postApproval: boolean;
    commentApproval: boolean;
    gamification: boolean;
    allowAnonymousPosts: boolean;
    requireMfaForAdmin: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true },
    description: String,
    avatar: String,
    coverImage: String,
    type: { type: String, enum: ['public', 'private'], default: 'public' },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, default: 0 },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    settings: {
      postApproval: { type: Boolean, default: false },
      commentApproval: { type: Boolean, default: false },
      gamification: { type: Boolean, default: false },
      allowAnonymousPosts: { type: Boolean, default: false },
      requireMfaForAdmin: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

GroupSchema.index({ adminId: 1 });
GroupSchema.index({ type: 1, createdAt: -1 });
GroupSchema.index({ conversationId: 1 });

export default mongoose.model<IGroup>('Group', GroupSchema);
