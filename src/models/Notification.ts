// ============================================================
// FILE: src/models/Notification.ts (UPDATED)
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'system' | 'affiliate' | 'course' | 'payment' | 'gamification' | 'academy';
  read: boolean;
  data?: any;
  channels: ('email' | 'sms' | 'push')[];
  sent: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  // ─── NEW ACADEMY SCOPING ──────────────────────────────────────
  academyId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['system', 'affiliate', 'course', 'payment', 'gamification', 'academy'], default: 'system' },
    read: { type: Boolean, default: false },
    data: { type: Schema.Types.Mixed },
    channels: { type: [String], enum: ['email', 'sms', 'push'], default: ['email'] },
    sent: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
    },
    // ─── NEW ──────────────────────────────────────────────────────
    academyId: { type: Schema.Types.ObjectId, ref: 'Academy' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ academyId: 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
