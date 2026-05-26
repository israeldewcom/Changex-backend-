// File: src/models/Announcement.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  createdAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: String,
    message: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
