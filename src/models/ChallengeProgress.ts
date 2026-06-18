import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeProgress extends Document {
  challengeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  progressValue: number;
  startedAt: Date;
  completedAt?: Date;
  adminNote?: string;
  rewardClaimed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeProgressSchema = new Schema<IChallengeProgress>(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'Challenge', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['enrolled', 'in_progress', 'completed', 'failed'],
      default: 'enrolled',
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressValue: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    adminNote: String,
    rewardClaimed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ChallengeProgressSchema.index({ challengeId: 1, userId: 1 }, { unique: true });

export default mongoose.model<IChallengeProgress>('ChallengeProgress', ChallengeProgressSchema);
