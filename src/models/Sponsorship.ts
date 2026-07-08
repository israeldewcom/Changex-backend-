// ============================================================
// FILE: src/models/Sponsorship.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ISponsorship extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'donation' | 'partnership' | 'collaboration' | 'brand' | 'media';
  amount: number;
  message: string;
  companyName?: string;
  website?: string;
  email: string;
  phone?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  adminNote?: string;
  receiptUrl?: string;
  reference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorshipSchema = new Schema<ISponsorship>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['donation', 'partnership', 'collaboration', 'brand', 'media'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    message: { type: String, required: true },
    companyName: String,
    website: String,
    email: { type: String, required: true },
    phone: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
    },
    adminNote: String,
    receiptUrl: String,
    reference: String,
  },
  { timestamps: true }
);

SponsorshipSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ISponsorship>('Sponsorship', SponsorshipSchema);
