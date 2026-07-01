// ============================================================
// FILE: src/models/AdConfig.ts (NEW)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';
import User from './User.js';

export interface IAdConfig extends Document {
  cpm: number;          // $ per 1000 impressions
  cpc: number;          // $ per click
  sharePercent: number; // percentage to creator (default 50)
  updatedBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  createdAt: Date;
}

const AdConfigSchema = new Schema<IAdConfig>(
  {
    cpm: { type: Number, default: 1.00 },
    cpc: { type: Number, default: 0.02 },
    sharePercent: { type: Number, default: 50, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// ─── Singleton helper ──────────────────────────────────────────
AdConfigSchema.statics.getConfig = async function(): Promise<IAdConfig> {
  let config = await this.findOne();
  if (!config) {
    const admin = await User.findOne({ roles: 'admin' });
    if (!admin) throw new Error('No admin found to create default ad config');
    config = await this.create({
      cpm: 1.00,
      cpc: 0.02,
      sharePercent: 50,
      updatedBy: admin._id,
    });
  }
  return config;
};

export default mongoose.model<IAdConfig>('AdConfig', AdConfigSchema);
