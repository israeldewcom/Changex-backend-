// File: src/models/UserBadge.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUserBadge extends Document {
  userId: mongoose.Types.ObjectId;
  badgeId: mongoose.Types.ObjectId;
  awardedAt: Date;
}

const UserBadgeSchema = new Schema<IUserBadge>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  badgeId: { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
  awardedAt: { type: Date, default: Date.now },
});

UserBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

export default mongoose.model<IUserBadge>('UserBadge', UserBadgeSchema);
