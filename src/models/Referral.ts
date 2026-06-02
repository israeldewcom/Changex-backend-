import mongoose, { Schema, Document } from 'mongoose';

export interface IReferral extends Document {
  referrerId: mongoose.Types.ObjectId;
  referredId: mongoose.Types.ObjectId;
  status: 'pending' | 'converted';
  earned: number;
  convertedAt?: Date;
}

const ReferralSchema = new Schema<IReferral>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    referredId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: ['pending', 'converted'], default: 'pending' },
    earned: { type: Number, default: 0 },
    convertedAt: Date,
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

// Ensure index for efficient lookups
ReferralSchema.index({ referredId: 1 }, { unique: true });

export default mongoose.model<IReferral>('Referral', ReferralSchema);
