import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupBan extends Document {
  groupId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  bannedBy: mongoose.Types.ObjectId;
  reason?: string;
  expiresAt?: Date;
  createdAt: Date;
}

const GroupBanSchema = new Schema<IGroupBan>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: String,
    expiresAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

GroupBanSchema.index({ groupId: 1, userId: 1 }, { unique: true });
export default mongoose.model<IGroupBan>('GroupBan', GroupBanSchema);
