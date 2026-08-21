// ============================================================
// FILE: src/models/AcademyDomain.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IAcademyDomain extends Document {
  academyId: mongoose.Types.ObjectId;
  domain: string;
  verified: boolean;
  verificationToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AcademyDomainSchema = new Schema<IAcademyDomain>(
  {
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy', required: true },
    domain: { type: String, required: true, unique: true },
    verified: { type: Boolean, default: false },
    verificationToken: String,
  },
  { timestamps: true }
);

AcademyDomainSchema.index({ domain: 1 }, { unique: true });
AcademyDomainSchema.index({ academyId: 1 });

export default mongoose.model<IAcademyDomain>('AcademyDomain', AcademyDomainSchema);
