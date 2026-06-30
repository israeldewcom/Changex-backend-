import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  name: string;
  description: string;
  avatar: string;
  coverImage: string;
  type: 'public' | 'private';
  adminId: mongoose.Types.ObjectId;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true },
    description: String,
    avatar: String,
    coverImage: String,
    type: { type: String, enum: ['public', 'private'], default: 'public' },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    memberCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

GroupSchema.index({ adminId: 1 });
GroupSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<IGroup>('Group', GroupSchema);
