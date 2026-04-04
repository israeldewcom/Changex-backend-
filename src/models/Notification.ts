// ============================================
// FILE: src/models/Notification.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  type: 'course' | 'payment' | 'social' | 'system' | 'achievement' | 'referral' | 'marketplace';
  title: string;
  message: string;
  data: Record<string, any>;
  isRead: boolean;
  readAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['course', 'payment', 'social', 'system', 'achievement', 'referral', 'marketplace'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
