import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupComment extends Document {
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
  parentId?: mongoose.Types.ObjectId;
  likes: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupCommentSchema = new Schema<IGroupComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'GroupPost', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'GroupComment' },
    likes: { type: Number, default: 0 },
    isEdited: { type: Boolean, default: false },
  },
  { timestamps: true }
);

GroupCommentSchema.index({ postId: 1, parentId: 1, createdAt: 1 });
export default mongoose.model<IGroupComment>('GroupComment', GroupCommentSchema);
