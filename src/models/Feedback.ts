import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  message: string;
  email?: string;
  userId?: mongoose.Types.ObjectId;
  url?: string;
  userAgent?: string;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    message: { type: String, required: true },
    email: String,
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    url: String,
    userAgent: String,
  },
  { timestamps: true }
);

export default mongoose.model<IFeedback>('Feedback', FeedbackSchema);
