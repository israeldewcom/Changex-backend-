// src/models/Contact.ts
import mongoose, { Schema, Document } from 'mongoose';
export interface IContact extends Document {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
}
const ContactSchema = new Schema<IContact>({
  firstName: String,
  lastName: String,
  email: String,
  subject: String,
  message: String,
}, { timestamps: true });
export default mongoose.model<IContact>('Contact', ContactSchema);
