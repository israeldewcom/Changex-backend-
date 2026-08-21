// ============================================================
// FILE: src/models/Achievement.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAchievement extends Document {
  name: string;
  description: string;
  icon: string;
  category: 'learning' | 'consistency' | 'community' | 'creation' | 'career';
  criteria: {
    type: 'lessons_completed' | 'courses_completed' | 'streak_days' | 'xp_earned' | 'posts_created' | 'comments_made' | 'followers_gained' | 'courses_created' | 'academy_created' | 'revenue_earned';
    target: number;
    // optional: any additional filters
  };
  badgeColor?: string;
  isHidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementSchema = new Schema<IAchievement>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    category: {
      type: String,
      enum: ['learning', 'consistency', 'community', 'creation', 'career'],
      required: true,
    },
    criteria: {
      type: {
        type: String,
        enum: ['lessons_completed', 'courses_completed', 'streak_days', 'xp_earned', 'posts_created', 'comments_made', 'followers_gained', 'courses_created', 'academy_created', 'revenue_earned'],
        required: true,
      },
      target: { type: Number, required: true },
    },
    badgeColor: String,
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AchievementSchema.index({ category: 1 });
AchievementSchema.index({ name: 1 }, { unique: true });

export default mongoose.model<IAchievement>('Achievement', AchievementSchema);
