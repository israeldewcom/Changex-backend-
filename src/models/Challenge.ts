import mongoose, { Schema, Document } from 'mongoose';

export interface IChallenge extends Document {
  title: string;
  description: string;
  instructions: string;
  startDate: Date;
  endDate: Date;
  rewardXP: number;
  rewardMoney: number;
  maxParticipants?: number;
  participants: mongoose.Types.ObjectId[];
  submissions: Array<{
    userId: mongoose.Types.ObjectId;
    content: string;
    submittedAt: Date;
    isWinner: boolean;
  }>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    instructions: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rewardXP: { type: Number, default: 500 },
    rewardMoney: { type: Number, default: 0 },
    maxParticipants: Number,
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    submissions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        content: String,
        submittedAt: Date,
        isWinner: { type: Boolean, default: false },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IChallenge>('Challenge', ChallengeSchema);
