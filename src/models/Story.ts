import mongoose, { Schema, Document } from 'mongoose';

export interface IStory extends Document {
  userId: mongoose.Types.ObjectId;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  thumbnailUrl: string;
  caption: string;
  linkUrl: string;
  expiresAt: Date;
  views: number;
  reactions: { userId: mongoose.Types.ObjectId; emoji: string }[];
  isHighlight: boolean;
  highlightGroup: string;
  createdAt: Date;
  updatedAt: Date;
}

const StorySchema = new Schema<IStory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    thumbnailUrl: String,
    caption: String,
    linkUrl: String,
    expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    views: { type: Number, default: 0 },
    reactions: [{ userId: Schema.Types.ObjectId, emoji: String }],
    isHighlight: { type: Boolean, default: false },
    highlightGroup: String,
  },
  { timestamps: true }
);

StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IStory>('Story', StorySchema);
