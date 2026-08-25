import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupAnalytics extends Document {
  groupId: mongoose.Types.ObjectId;
  date: Date;
  posts: number;
  comments: number;
  likes: number;
  newMembers: number;
  activeMembers: number;
  totalMembers: number;
  engagementRate: number;
  createdAt: Date;
}

const GroupAnalyticsSchema = new Schema<IGroupAnalytics>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    date: { type: Date, required: true, index: true },
    posts: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    newMembers: { type: Number, default: 0 },
    activeMembers: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

GroupAnalyticsSchema.index({ groupId: 1, date: 1 }, { unique: true });
export default mongoose.model<IGroupAnalytics>('GroupAnalytics', GroupAnalyticsSchema);
