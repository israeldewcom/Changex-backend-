// ============================================================
// FILE: src/models/UserAchievement.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IUserAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  achievementId: mongoose.Types.ObjectId;
  earnedAt: Date;
  progress?: number; // for tracking progress toward achievement
}

const UserAchievementSchema = new Schema<IUserAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    achievementId: { type: Schema.Types.ObjectId, ref: 'Achievement', required: true },
    earnedAt: { type: Date, default: Date.now },
    progress: { type: Number, default: 0 },
  },
  { timestamps: true }
);

UserAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
UserAchievementSchema.index({ userId: 1 });

export default mongoose.model<IUserAchievement>('UserAchievement', UserAchievementSchema);
