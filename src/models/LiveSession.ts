import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveSession extends Document {
  title: string;
  description: string;
  hostId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime: Date;
  type: 'webinar' | 'office_hours' | 'one_on_one';
  price: number;
  maxAttendees: number;
  attendees: mongoose.Types.ObjectId[];
  recordingUrl: string;
  status: 'scheduled' | 'live' | 'ended' | 'recorded';
  createdAt: Date;
  updatedAt: Date;
}

const LiveSessionSchema = new Schema<ILiveSession>(
  {
    title: { type: String, required: true },
    description: String,
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    type: { type: String, enum: ['webinar', 'office_hours', 'one_on_one'], default: 'webinar' },
    price: { type: Number, default: 0 },
    maxAttendees: { type: Number, default: 100 },
    attendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    recordingUrl: String,
    status: { type: String, enum: ['scheduled', 'live', 'ended', 'recorded'], default: 'scheduled' },
  },
  { timestamps: true }
);

LiveSessionSchema.index({ hostId: 1, startTime: -1 });
LiveSessionSchema.index({ status: 1 });

export default mongoose.model<ILiveSession>('LiveSession', LiveSessionSchema);
