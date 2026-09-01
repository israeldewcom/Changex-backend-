// ============================================================
// FILE: src/models/Transaction.ts (UPDATED)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
  // ─── NEW ACADEMY FIELDS ──────────────────────────────────────
  academyId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'referral_bonus',
        'referral_commission',
        'affiliate_commission',
        'instructor_earning',
        'course_purchase',
        'withdrawal',
        'bonus',
        'subscription',
        'book_purchase',
        'book_author_earning',
        'article_purchase',
        'article_author_earning',
        'meeting_booking',
        'campaign_payment',
        'platform_fee',
        'academy_subscription',
        'academy_sale',
        'ad_revenue',
      ],
      required: true
    },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    description: String,
    reference: String,
    metadata: Schema.Types.Mixed,
    // ─── NEW ──────────────────────────────────────────────────────
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy' },
  },
  { timestamps: true }
);

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ academyId: 1 });
// Prevents the same Paystack reference from ever being recorded as
// "completed" twice, even if two verify requests race each other and
// both pass the application-level idempotency check at nearly the same
// instant. Sparse because some transaction types (e.g. welcome bonus)
// have no reference at all.
TransactionSchema.index(
  { reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' }, status: 'completed' } }
);

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
