// ============================================
// FILE: src/models/Announcement.ts (existing, included for completeness)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  createdBy: mongoose.Types.ObjectId;
  sentToAll: boolean;
  sentAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning', 'success', 'danger'], default: 'info' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentToAll: { type: Boolean, default: false },
    sentAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
