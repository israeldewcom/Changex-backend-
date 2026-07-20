// ============================================================
// FILE: src/models/Book.ts (FINAL – with all required fields)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  description: string;
  coverImage: string;
  fileUrl: string;
  diskPath?: string;
  cloudinaryUrl?: string;
  price: number;
  downloads: number;
  views: number;
  isPublished: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  adminApprovedBy?: mongoose.Types.ObjectId;
  adminApprovedAt?: Date;
  affiliatePercent: number;
  isPremium: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema = new Schema<IBook>(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: String,
    coverImage: String,
    fileUrl: { type: String, required: true },
    diskPath: { type: String, default: '' },
    cloudinaryUrl: { type: String, default: '' },
    price: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    rejectionReason: String,
    adminApprovedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    adminApprovedAt: Date,
    affiliatePercent: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BookSchema.index({ approvalStatus: 1, isPublished: 1 });
BookSchema.index({ uploadedBy: 1, createdAt: -1 });

export default mongoose.model<IBook>('Book', BookSchema);
