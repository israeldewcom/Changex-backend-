// ============================================
// FILE: src/models/Badge.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IBadge extends Document {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  category: 'learning' | 'achievement' | 'streak' | 'social' | 'creator' | 'special';
  requirement: {
    type: 'xp' | 'courses_completed' | 'streak' | 'referrals' | 'lessons_completed' | 'custom';
    value: number;
    metadata?: Record<string, any>;
  };
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  points: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserBadge extends Document {
  user: mongoose.Types.ObjectId;
  badge: mongoose.Types.ObjectId;
  earnedAt: Date;
  isDisplayed: boolean;
}

const BadgeSchema = new Schema<IBadge>(
  {
    name: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    color: { type: String, required: true },
    category: { type: String, enum: ['learning', 'achievement', 'streak', 'social', 'creator', 'special'], required: true },
    requirement: {
      type: { type: String, enum: ['xp', 'courses_completed', 'streak', 'referrals', 'lessons_completed', 'custom'], required: true },
      value: { type: Number, required: true },
      metadata: { type: Schema.Types.Mixed },
    },
    rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary'], default: 'common' },
    points: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const UserBadgeSchema = new Schema<IUserBadge>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    badge: { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
    earnedAt: { type: Date, default: Date.now },
    isDisplayed: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UserBadgeSchema.index({ user: 1, badge: 1 }, { unique: true });

export const Badge = mongoose.model<IBadge>('Badge', BadgeSchema);
export const UserBadge = mongoose.model<IUserBadge>('UserBadge', UserBadgeSchema);
