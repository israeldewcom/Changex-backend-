import mongoose, { Schema, Document } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  description: string;
  coverImage: string;
  fileUrl: string;        // PDF hosted on Cloudinary or S3
  price: number;          // 0 for free
  downloads: number;
  views: number;
  isPublished: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema = new Schema<IBook>({
  title: { type: String, required: true },
  author: { type: String, required: true },
  description: String,
  coverImage: String,
  fileUrl: { type: String, required: true },
  price: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
