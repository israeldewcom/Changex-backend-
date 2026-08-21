// ============================================================
// FILE: src/models/Academy.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAcademy extends Document {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  favicon?: string;
  ownerId: mongoose.Types.ObjectId;
  subscriptionTier: 'free' | 'premium' | 'enterprise';
  subscriptionEnds?: Date;
  subscriptionPrice?: number;
  isActive: boolean;
  isPublic: boolean;
  allowPublicEnrollment: boolean;
  requireApproval: boolean;
  customDomain?: string;
  settings: {
    theme: {
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      backgroundColor: string;
      textColor: string;
      fontFamily: string;
      borderRadius: string;
      buttonStyle: string;
      cardStyle: string;
      navigationStyle: string;
      darkMode: boolean;
    };
    seo: {
      title?: string;
      description?: string;
      keywords?: string;
    };
    customCSS?: string;
    customJS?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const AcademySchema = new Schema<IAcademy>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    logo: String,
    favicon: String,
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscriptionTier: { type: String, enum: ['free', 'premium', 'enterprise'], default: 'free' },
    subscriptionEnds: Date,
    subscriptionPrice: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },
    allowPublicEnrollment: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: false },
    customDomain: { type: String, unique: true, sparse: true },
    settings: {
      theme: {
        primaryColor: { type: String, default: '#D4AF37' },
        secondaryColor: { type: String, default: '#FBBF24' },
        accentColor: { type: String, default: '#B8860B' },
        backgroundColor: { type: String, default: '#FDF8F0' },
        textColor: { type: String, default: '#2C2418' },
        fontFamily: { type: String, default: 'Inter, sans-serif' },
        borderRadius: { type: String, default: '20px' },
        buttonStyle: { type: String, default: 'rounded' },
        cardStyle: { type: String, default: 'glass' },
        navigationStyle: { type: String, default: 'modern' },
        darkMode: { type: Boolean, default: false },
      },
      seo: {
        title: String,
        description: String,
        keywords: String,
      },
      customCSS: String,
      customJS: String,
    },
  },
  { timestamps: true }
);

AcademySchema.index({ slug: 1 }, { unique: true });
AcademySchema.index({ customDomain: 1 }, { unique: true, sparse: true });
AcademySchema.index({ ownerId: 1 });
AcademySchema.index({ isActive: 1, isPublic: 1 });

export default mongoose.model<IAcademy>('Academy', AcademySchema);
