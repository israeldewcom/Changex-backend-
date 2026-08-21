// ============================================================
// FILE: src/models/OfflineSync.ts
// ============================================================

import mongoose, { Schema, Document } from 'mongoose';

export interface IOfflineSync extends Document {
  userId: mongoose.Types.ObjectId;
  syncData: Record<string, any>;
  syncedAt: Date;
  status: 'pending' | 'synced' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const OfflineSyncSchema = new Schema<IOfflineSync>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    syncData: { type: Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'synced', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

OfflineSyncSchema.index({ userId: 1, status: 1 });
OfflineSyncSchema.index({ userId: 1, syncedAt: -1 });

export default mongoose.model<IOfflineSync>('OfflineSync', OfflineSyncSchema);
