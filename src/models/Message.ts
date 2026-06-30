import mongoose, { Schema, Document } from 'mongoose';

export interface IMeeting extends Document {
  title: string;
  description: string;
  hostId: mongoose.Types.ObjectId;
  attendeeId?: mongoose.Types.ObjectId;
  startTime: Date;
  duration: number;
  price: number;
  meetingUrl: string;
  status: 'scheduled' | 'booked' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    title: { type: String, required: true },
    description: String,
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attendeeId: { type: Schema.Types.ObjectId, ref: 'User' },
    startTime: { type: Date, required: true },
    duration: { type: Number, default: 30 },
    price: { type: Number, default: 0 },
    meetingUrl: String,
    status: { type: String, enum: ['scheduled', 'booked', 'completed', 'cancelled'], default: 'scheduled' },
  },
  { timestamps: true }
);

MeetingSchema.index({ hostId: 1, startTime: -1 });

export default mongoose.model<IMeeting>('Meeting', MeetingSchema);
