// ============================================================
// FILE: src/models/AdConfig.ts (UPDATED – with static method typing)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';
import User from './User.js';

export interface IAdConfig extends Document {
  cpm: number;
  cpc: number;
  sharePercent: number;
  updatedBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  createdAt: Date;
}

// ─── Define the static method interface ──────────────────────
interface IAdConfigModel extends mongoose.Model<IAdConfig> {
  getConfig(): Promise<IAdConfig>;
}

const AdConfigSchema = new Schema<IAdConfig, IAdConfigModel>(
  {
    cpm: { type: Number, default: 1.00 },
    cpc: { type: Number, default: 0.02 },
    sharePercent: { type: Number, default: 50, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// ─── Static method ────────────────────────────────────────────
AdConfigSchema.statics.getConfig = async function (): Promise<IAdConfig> {
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

export default mongoose.model<IAdConfig, IAdConfigModel>('AdConfig', AdConfigSchema);
