// File: src/models/User.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  roles: string[];
  isApprovedInstructor: boolean;
  isPremium: boolean;
  subscriptionExpires?: Date;
  referralCode: string;
  referredBy?: string;
  walletBalance: number;
  pendingWithdrawal: number;
  xp: number;
  level: number;
  streakDays: number;
  lastActivity: Date;
  bio?: string;
  location?: string;
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
  };
  preferredCurrency: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: String,
    avatarUrl: String,
    roles: { type: [String], enum: ['student', 'instructor', 'admin'], default: ['student'] },
    isApprovedInstructor: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    subscriptionExpires: Date,
    referralCode: { type: String, unique: true, required: true },
    referredBy: String,
    walletBalance: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    xp: { type: Number, default: 0, index: true },
    level: { type: Number, default: 1 },
    streakDays: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
    bio: String,
    location: String,
    bankAccount: {
      type: new Schema({
        bankName: String,
        accountNumber: String,
        accountName: String,
      }, { _id: false }),
    },
    preferredCurrency: { type: String, default: 'NGN' },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ walletBalance: -1 });
UserSchema.index({ roles: 1 });

export default mongoose.model<IUser>('User', UserSchema);
