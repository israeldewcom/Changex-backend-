// File: src/models/AuditLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  ip?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  ip: String,
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
