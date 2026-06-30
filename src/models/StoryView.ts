import mongoose, { Schema, Document } from 'mongoose';

export interface IStoryView extends Document {
  storyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  viewedAt: Date;
}

const StoryViewSchema = new Schema<IStoryView>({
  storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  viewedAt: { type: Date, default: Date.now },
});

StoryViewSchema.index({ storyId: 1, userId: 1 }, { unique: true });

export default mongoose.model<IStoryView>('StoryView', StoryViewSchema);
