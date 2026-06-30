import mongoose, { Schema, Document } from 'mongoose';

export interface IGroupResource extends Document {
  groupId: mongoose.Types.ObjectId;
  title: string;
  url: string;
  type: 'link' | 'pdf' | 'code' | 'image' | 'video';
  addedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const GroupResourceSchema = new Schema<IGroupResource>({
  groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  title: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, enum: ['link', 'pdf', 'code', 'image', 'video'], default: 'link' },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

GroupResourceSchema.index({ groupId: 1, createdAt: -1 });

export default mongoose.model<IGroupResource>('GroupResource', GroupResourceSchema);
