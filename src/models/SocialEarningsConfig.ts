import mongoose, { Schema, Document } from 'mongoose';

export interface ISocialEarningsConfig extends Document {
  dailyPoolAmount: number;
  engagementWeights: {
    like: number;
    comment: number;
    share: number;
    view: number;
  };
  lastDistributionDate: Date;
  updatedBy: mongoose.Types.ObjectId;
}

const SocialEarningsConfigSchema = new Schema<ISocialEarningsConfig>({
  dailyPoolAmount: { type: Number, default: 10000 },
  engagementWeights: {
    like: { type: Number, default: 1 },
    comment: { type: Number, default: 2 },
    share: { type: Number, default: 3 },
    view: { type: Number, default: 0.5 },
  },
  lastDistributionDate: { type: Date, default: null },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

export default mongoose.model<ISocialEarningsConfig>('SocialEarningsConfig', SocialEarningsConfigSchema);
