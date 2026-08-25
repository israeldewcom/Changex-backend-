import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupReport extends Document {
  groupId: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  targetId: mongoose.Types.ObjectId;
  targetType: 'post' | 'comment';
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GroupReportSchema = new Schema<IGroupReport>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetType: { type: String, enum: ['post', 'comment'], required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed', 'action_taken'], default: 'pending' },
    adminNote: String,
  },
  { timestamps: true }
);

GroupReportSchema.index({ groupId: 1, status: 1 });
export default mongoose.model<IGroupReport>('GroupReport', GroupReportSchema);
