import mongoose, { Schema, Document } from 'mongoose';

export interface IBook extends Document {
  title: string;
  author: string;
  description: string;
  coverImage: string;
  fileUrl: string;
  price: number;
  downloads: number;
  views: number;
  isPublished: boolean;
  uploadedBy: mongoose.Types.ObjectId;
  // NEW FIELDS
  authorId: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  affiliatePercent: number;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  slug: string;
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
    price: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // NEW
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    affiliatePercent: { type: Number, default: 0, min: 0, max: 50 },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    slug: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Generate slug before saving
BookSchema.pre('save', function (next) {
  if (this.isModified('title') && !this.slug) {
    const base = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    this.slug = `${base}-${Date.now().toString(36)}`;
  }
  next();
});

export default mongoose.model<IBook>('Book', BookSchema);
