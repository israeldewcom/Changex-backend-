import mongoose, { Schema, Document } from 'mongoose';

export interface IRecording extends Document {
  hostId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  meetingId?: mongoose.Types.ObjectId;
  title: string;
  url: string;
  duration: number;
  createdAt: Date;
}

const RecordingSchema = new Schema<IRecording>(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'LiveSession' },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
    title: { type: String, required: true },
    url: { type: String, required: true },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

RecordingSchema.index({ hostId: 1, createdAt: -1 });

export default mongoose.model<IRecording>('Recording', RecordingSchema);
