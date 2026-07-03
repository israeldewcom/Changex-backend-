import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'referral_bonus',
        'affiliate_commission',
        'instructor_earning',
        'course_purchase',
        'withdrawal',
        'bonus',
        'subscription',
        'book_purchase',
        'book_author_earning',   // NEW
        'platform_fee',          // NEW
      ],
      required: true
    },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    description: String,
    reference: String,
    metadata: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
