import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  parentId?: mongoose.Types.ObjectId;
  content: string;
  likes: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    content: { type: String, required: true },
    likes: { type: Number, default: 0 },
    isEdited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ parentId: 1 });

export default mongoose.model<IComment>('Comment', CommentSchema);
