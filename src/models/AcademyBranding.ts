// ============================================================
// FILE: src/models/AcademyBranding.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAcademyBranding extends Document {
  academyId: mongoose.Types.ObjectId;
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
  logo?: string;
  favicon?: string;
  customCSS?: string;
  customJS?: string;
  headerScripts?: string;
  footerScripts?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AcademyBrandingSchema = new Schema<IAcademyBranding>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy', required: true, unique: true },
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
    logo: String,
    favicon: String,
    customCSS: String,
    customJS: String,
    headerScripts: String,
    footerScripts: String,
  },
  { timestamps: true }
);

export default mongoose.model<IAcademyBranding>('AcademyBranding', AcademyBrandingSchema);
