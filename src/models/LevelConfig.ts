// ============================================================
// FILE: src/models/LevelConfig.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ILevelConfig extends Document {
  level: number;
  title: string;
  xpRequired: number;
  rewards?: {
    premiumDays?: number;
    walletBonus?: number;
    badge?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const LevelConfigSchema = new Schema<ILevelConfig>(
  {
    level: { type: Number, required: true, unique: true },
    title: { type: String, required: true },
    xpRequired: { type: Number, required: true },
    rewards: {
      premiumDays: Number,
      walletBonus: Number,
      badge: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model<ILevelConfig>('LevelConfig', LevelConfigSchema);
