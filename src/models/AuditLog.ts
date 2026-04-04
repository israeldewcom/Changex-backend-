// ============================================
// FILE: src/models/AuditLog.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  user?: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ip: string;
  userAgent: string;
  status: 'success' | 'failure';
  error?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    details: { type: Schema.Types.Mixed, default: {} },
    ip: { type: String, required: true },
    userAgent: { type: String, required: true },
    status: { type: String, enum: ['success', 'failure'], required: true },
    error: { type: String },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ user: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
