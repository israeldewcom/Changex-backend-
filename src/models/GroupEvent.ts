import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupEvent extends Document {
  groupId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  type: 'voice_chat' | 'coding_session' | 'study_meet' | 'webinar';
  meetingUrl: string;
  createdBy: mongoose.Types.ObjectId;
  attendees: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupEventSchema = new Schema<IGroupEvent>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    title: { type: String, required: true },
    description: String,
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    type: { type: String, enum: ['voice_chat', 'coding_session', 'study_meet', 'webinar'], default: 'voice_chat' },
    meetingUrl: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

GroupEventSchema.index({ groupId: 1, startTime: 1 });

export default mongoose.model<IGroupEvent>('GroupEvent', GroupEventSchema);
