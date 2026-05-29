import mongoose, { Schema, Document } from 'mongoose';

export interface ICourse extends Document {
  title: string;
  subtitle?: string;
  description: string;
  category: string;
  level: string;
  language: string;
  thumbnail?: string;
  promoVideoUrl?: string;
  price: number;
  salePrice?: number;
  hasAffiliate: boolean;
  affiliatePercent: number;
  isPublished: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  totalLessons: number;
  totalStudents: number;
  avgRating: number;
  certificateEnabled: boolean;
  instructorId: mongoose.Types.ObjectId;   // ✅ fixed from 'instructord'
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    subtitle: String,
    description: { type: String, required: true },
    category: String,
    level: String,
    language: { type: String, default: 'English' },
    thumbnail: String,
    promoVideoUrl: String,
    price: { type: Number, default: 0 },
    salePrice: Number,
    hasAffiliate: { type: Boolean, default: false },
    affiliatePercent: { type: Number, default: 15 },
    isPublished: { type: Boolean, default: false },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: String,
    totalLessons: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    certificateEnabled: { type: Boolean, default: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // ✅ required
  },
  { timestamps: true }
);

CourseSchema.index({ isPublished: 1, approvalStatus: 1 });
CourseSchema.index({ category: 1 });

export default mongoose.model<ICourse>('Course', CourseSchema);
