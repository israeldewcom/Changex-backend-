import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminChallenge extends Document {
  title: string;
  description: string;
  instructions: string;
  startDate: Date;
  endDate: Date;
  xpReward: number;
  coinReward: number;
  isActive: boolean;
  participants: mongoose.Types.ObjectId[];
  completions: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const AdminChallengeSchema = new Schema<IAdminChallenge>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    instructions: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    xpReward: { type: Number, default: 100 },
    coinReward: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    completions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

export default mongoose.model<IAdminChallenge>('AdminChallenge', AdminChallengeSchema);
