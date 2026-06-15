import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminAd extends Document {
  name: string;
  imageUrl: string;
  linkUrl: string;
  placement: 'sidebar' | 'banner' | 'infeed' | 'popup';
  startDate: Date;
  endDate?: Date;
  impressions: number;
  clicks: number;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdminAdSchema = new Schema<IAdminAd>(
  {
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, required: true },
    placement: { type: String, enum: ['sidebar', 'banner', 'infeed', 'popup'], required: true },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminAd>('AdminAd', AdminAdSchema);
