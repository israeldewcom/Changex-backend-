// File: src/models/Notification.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: string;
  read: boolean;
  data?: any;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    message: String,
    type: { type: String, enum: ['system', 'affiliate', 'course', 'payment'] },
    read: { type: Boolean, default: false },
    data: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NotificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
