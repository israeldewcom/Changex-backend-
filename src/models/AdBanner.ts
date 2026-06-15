import mongoose, { Schema, Document } from 'mongoose';

export interface IAdBanner extends Document {
  title: string;
  imageUrl: string;
  linkUrl: string;
  position: 'sidebar' | 'header' | 'footer' | 'lesson-top' | 'lesson-bottom';
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  clicks: number;
  impressions: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdBannerSchema = new Schema<IAdBanner>(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, required: true },
    position: { type: String, enum: ['sidebar', 'header', 'footer', 'lesson-top', 'lesson-bottom'], required: true },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IAdBanner>('AdBanner', AdBannerSchema);
