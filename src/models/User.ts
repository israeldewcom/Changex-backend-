import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
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
  welcomeBonusClaimed: boolean;
  hasClaimedWelcomeBonus: boolean;
  isBanned: boolean;
  seoSlug?: string;
  socialLinks?: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    website?: string;
  };
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
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streakDays: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
    bio: String,
    location: String,
    bankAccount: {
      type: new Schema(
        {
          bankName: String,
          accountNumber: String,
          accountName: String,
        },
        { _id: false }
      ),
    },
    preferredCurrency: { type: String, default: 'NGN' },
    welcomeBonusClaimed: { type: Boolean, default: false },
    hasClaimedWelcomeBonus: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    seoSlug: { type: String, unique: true, sparse: true },
    socialLinks: {
      twitter: String,
      github: String,
      linkedin: String,
      website: String,
    },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 });
UserSchema.index({ referralCode: 1 });
UserSchema.index({ seoSlug: 1 });

UserSchema.pre('save', function(next) {
  if (!this.seoSlug && this.firstName && this.lastName) {
    this.seoSlug = `${this.firstName.toLowerCase()}-${this.lastName.toLowerCase()}-${this._id.toString().slice(-6)}`;
  }
  next();
});

export default mongoose.model<IUser>('User', UserSchema);
