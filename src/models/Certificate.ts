// ============================================
// FILE: src/models/Certificate.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  enrollment: mongoose.Types.ObjectId;
  certificateId: string;
  issueDate: Date;
  expiryDate?: Date;
  verificationUrl: string;
  pdfUrl: string;
  metadata: {
    userName: string;
    courseName: string;
    completionScore: number;
    duration: number;
    instructorName: string;
  };
  blockchainHash?: string;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
  downloads: number;
  shares: number;
  createdAt: Date;
  updatedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    certificateId: { type: String, required: true, unique: true },
    issueDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    verificationUrl: { type: String, required: true },
    pdfUrl: { type: String, required: true },
    metadata: {
      userName: { type: String, required: true },
      courseName: { type: String, required: true },
      completionScore: { type: Number, required: true },
      duration: { type: Number, required: true },
      instructorName: { type: String, required: true },
    },
    blockchainHash: { type: String },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date },
    revokedReason: { type: String },
    downloads: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CertificateSchema.index({ certificateId: 1 });
CertificateSchema.index({ user: 1, course: 1 });
CertificateSchema.index({ issueDate: -1 });
CertificateSchema.index({ verificationUrl: 1 });

export const Certificate = mongoose.model<ICertificate>('Certificate', CertificateSchema);
