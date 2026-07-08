import mongoose, { Schema, Document } from 'mongoose';

export interface ICampaignAnalytics extends Document {
  campaignId: mongoose.Types.ObjectId;
  date: Date;
  impressions: number;
  clicks: number;
  views: number;
  uniqueViews: number;
  uniqueImpressions: number;
  invalidImpressions: number;
  invalidClicks: number;
  conversions: number;
  revenue: number;
  createdAt: Date;
}

const CampaignAnalyticsSchema = new Schema<ICampaignAnalytics>(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    date: { type: Date, required: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    uniqueImpressions: { type: Number, default: 0 },
    invalidImpressions: { type: Number, default: 0 },
    invalidClicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CampaignAnalyticsSchema.index({ campaignId: 1, date: 1 });

export default mongoose.model<ICampaignAnalytics>('CampaignAnalytics', CampaignAnalyticsSchema);
