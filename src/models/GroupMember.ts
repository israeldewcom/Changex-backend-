import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupMember extends Document {
  groupId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: Date;
}

const GroupMemberSchema = new Schema<IGroupMember>({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'moderator', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
});

GroupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
GroupMemberSchema.index({ groupId: 1, role: 1 });

export default mongoose.model<IGroupMember>('GroupMember', GroupMemberSchema);
