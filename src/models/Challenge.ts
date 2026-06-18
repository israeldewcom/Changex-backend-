import mongoose, { Schema, Document } from 'mongoose';

// Define a sub-schema for completion criteria
const CompletionCriteriaSchema = new Schema({
  type: {
    type: String,
    enum: ['lessons', 'xp', 'course_completion'],
    required: true,
  },
  courseId: {
    type: Schema.Types.ObjectId,
    ref: 'Course',
  },
  targetCount: {
    type: Number,
    default: 0,
  },
}, { _id: false });

export interface IChallenge extends Document {
  title: string;
  description: string;
  instructions?: string;
  startDate: Date;
  endDate: Date;
  rewardXP: number;
  rewardAmount?: number;
  rewardPremiumDays?: number;
  participants: mongoose.Types.ObjectId[];
  winners: mongoose.Types.ObjectId[];
  status: 'upcoming' | 'active' | 'completed';
  createdBy: mongoose.Types.ObjectId;
  completionCriteria?: {
    type: 'lessons' | 'xp' | 'course_completion';
    courseId?: mongoose.Types.ObjectId;
    targetCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema = new Schema<IChallenge>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    instructions: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    rewardXP: { type: Number, default: 500 },
    rewardAmount: { type: Number, default: 0 },
    rewardPremiumDays: { type: Number, default: 0 },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    winners: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed'],
      default: 'upcoming',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // ✅ Use the sub-schema
    completionCriteria: {
      type: CompletionCriteriaSchema,
      required: false,
    },
  },
  { timestamps: true }
);

ChallengeSchema.index({ status: 1, startDate: 1 });
ChallengeSchema.index({ endDate: 1 });

export default mongoose.model<IChallenge>('Challenge', ChallengeSchema);
