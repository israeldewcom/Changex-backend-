// ============================================================
// FILE: src/models/Campaign.ts (UPDATED – added pending_payment status & manual payment fields)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ICampaign extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  placement: string;
  budget: number;
  spent: number;
  escrowBalance: number;
  totalDeducted: number;
  startDate: Date;
  endDate: Date;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'paused' | 'pending_payment';
  rejectionReason?: string;
  targetImpressions: number;
  targetClicks: number;
  impressions: number;
  clicks: number;
  views: number;
  uniqueViews: number;
  uniqueImpressions: number;
  invalidImpressions: number;
  invalidClicks: number;
  conversions: number;
  cpc: number;
  cpm: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentReference: string;
  manualPaymentVerified: boolean;
  manualPaymentReference: string;
  manualPaymentReceipt: string;
  fraudScore: number;
  ipBlacklist: string[];
  userAgentBlacklist: string[];
  adminApprovedBy?: mongoose.Types.ObjectId;
  adminApprovedAt?: Date;
  lastDeductionDate?: Date;
  isActive: boolean;
  isSponsored: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, required: true },
    placement: { type: String, required: true },
    budget: { type: Number, required: true, min: 1000 },
    spent: { type: Number, default: 0 },
    escrowBalance: { type: Number, default: 0 },
    totalDeducted: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'paused', 'pending_payment'],
      default: 'pending',
    },
    rejectionReason: String,
    targetImpressions: { type: Number, default: 0 },
    targetClicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    uniqueImpressions: { type: Number, default: 0 },
    invalidImpressions: { type: Number, default: 0 },
    invalidClicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    cpc: { type: Number, default: 0.02 },
    cpm: { type: Number, default: 1.0 },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentReference: { type: String, default: '' },
    manualPaymentVerified: { type: Boolean, default: false },
    manualPaymentReference: { type: String, default: '' },
    manualPaymentReceipt: { type: String, default: '' },
    fraudScore: { type: Number, default: 0 },
    ipBlacklist: { type: [String], default: [] },
    userAgentBlacklist: { type: [String], default: [] },
    adminApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adminApprovedAt: Date,
    lastDeductionDate: Date,
    isActive: { type: Boolean, default: false },
    isSponsored: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CampaignSchema.index({ userId: 1, status: 1 });
CampaignSchema.index({ placement: 1, isActive: 1, startDate: 1, endDate: 1 });

export default mongoose.model<ICampaign>('Campaign', CampaignSchema);
