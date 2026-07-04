// ============================================================
// FILE: src/models/Book.ts (COMPLETE UPDATED – production ready)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  description: string;
  coverImage: string;
  fileUrl: string;          // final URL (points to cloudinary or disk)
  diskPath?: string;        // local disk path (for fallback)
  cloudinaryUrl?: string;   // cloudinary URL (optional)
  price: number;
  downloads: number;
  views: number;
  isPublished: boolean;
  isPremium: boolean;       // NEW: only premium users can view/download
  approvalStatus: 'pending' | 'approved' | 'rejected';  // NEW: admin approval workflow
  rejectionReason?: string; // NEW: reason if rejected
  uploadedBy: mongoose.Types.ObjectId;  // admin who uploaded the book
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema = new Schema<IBook>(
  {
    title: {
      type: String,
      required: [true, 'Book title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    author: {
      type: String,
      required: [true, 'Author name is required'],
      trim: true,
      maxlength: [100, 'Author name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    coverImage: {
      type: String,
      default: '',
    },
    fileUrl: {
      type: String,
      required: [true, 'Book file URL is required'],
    },
    diskPath: {
      type: String,
      default: '',
    },
    cloudinaryUrl: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative'],
    },
    downloads: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader ID is required'],
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────
BookSchema.index({ title: 'text', author: 'text' });
BookSchema.index({ isPublished: 1, approvalStatus: 1 });
BookSchema.index({ uploadedBy: 1, createdAt: -1 });
BookSchema.index({ isPremium: 1, isPublished: 1 });
BookSchema.index({ approvalStatus: 1, createdAt: -1 });
BookSchema.index({ price: 1 });
BookSchema.index({ views: -1 });
BookSchema.index({ downloads: -1 });

// ─── Virtuals ─────────────────────────────────────────────────────────
BookSchema.virtual('isFree').get(function (this: IBook) {
  return this.price === 0;
});

BookSchema.virtual('isAvailable').get(function (this: IBook) {
  return this.isPublished && this.approvalStatus === 'approved';
});

BookSchema.virtual('isPending').get(function (this: IBook) {
  return this.approvalStatus === 'pending';
});

BookSchema.virtual('isRejected').get(function (this: IBook) {
  return this.approvalStatus === 'rejected';
});

// ─── Methods ──────────────────────────────────────────────────────────
BookSchema.methods.incrementViews = async function (this: IBook) {
  this.views += 1;
  return this.save();
};

BookSchema.methods.incrementDownloads = async function (this: IBook) {
  this.downloads += 1;
  return this.save();
};

BookSchema.methods.isAccessibleToUser = function (this: IBook, user: any) {
  if (!this.isPublished || this.approvalStatus !== 'approved') return false;
  if (this.isPremium && !user?.isPremium) return false;
  return true;
};

// ─── Static Methods ──────────────────────────────────────────────────
BookSchema.statics.getPublishedBooks = async function (limit = 50) {
  return this.find({
    isPublished: true,
    approvalStatus: 'approved',
  })
    .sort('-createdAt')
    .limit(limit)
    .lean();
};

BookSchema.statics.getPendingBooks = async function (limit = 50) {
  return this.find({ approvalStatus: 'pending' })
    .populate('uploadedBy', 'firstName lastName email')
    .sort('-createdAt')
    .limit(limit)
    .lean();
};

BookSchema.statics.getPremiumBooks = async function (limit = 50) {
  return this.find({
    isPublished: true,
    approvalStatus: 'approved',
    isPremium: true,
  })
    .sort('-createdAt')
    .limit(limit)
    .lean();
};

// ─── Ensure virtuals are included in JSON output ──────────────────
BookSchema.set('toJSON', { virtuals: true });
BookSchema.set('toObject', { virtuals: true });

export default mongoose.model<IBook>('Book', BookSchema);
