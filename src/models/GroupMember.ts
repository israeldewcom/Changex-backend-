// ============================================================
// FILE: src/models/GroupMember.ts (UPDATED)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupMember extends Document {
  groupId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'moderator' | 'member' | 'guest';
  status: 'active' | 'pending' | 'suspended' | 'banned';
  mutedUntil?: Date;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'moderator', 'member', 'guest'], default: 'member' },
    status: { type: String, enum: ['active', 'pending', 'suspended', 'banned'], default: 'active' },
    mutedUntil: Date,
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
GroupMemberSchema.index({ groupId: 1, role: 1 });
GroupMemberSchema.index({ userId: 1 });

export default mongoose.model<IGroupMember>('GroupMember', GroupMemberSchema);
