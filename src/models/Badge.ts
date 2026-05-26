// File: src/models/Badge.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IBadge extends Document {
  name: string;
  description: string;
  icon: string;
  criteria: string;
  createdAt: Date;
}

const BadgeSchema = new Schema<IBadge>({
  name: { type: String, required: true, unique: true },
  description: String,
  icon: String,
  criteria: String,
}, { timestamps: true });

export default mongoose.model<IBadge>('Badge', BadgeSchema);
