// ============================================
// FILE: src/models/User.ts (Complete - with affiliateLinks, referralCode, updateStreak)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  
  // Subscription
  subscriptionTier: 'free' | 'premium' | 'elite';
  subscriptionStatus: 'active' | 'canceled' | 'expired' | 'trialing';
  subscriptionId?: string;
  subscriptionExpiresAt?: Date;
  stripeCustomerId?: string;
  paystackCustomerCode?: string;
  
  // Wallet
  walletBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  pendingWithdrawal: number;
  
  // Gamification
  xp: number;
  level: number;
  streak: number;
  lastActiveAt: Date;
  badges: string[];
  
  // Referrals
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referrals: mongoose.Types.ObjectId[];
  referralEarnings: number;
  referralLevel: number;
  
  // Affiliate links
  affiliateLinks: Array<{
    _id?: mongoose.Types.ObjectId;
    courseId: mongoose.Types.ObjectId;
    code: string;
    clicks: number;
    conversions: number;
    totalEarned: number;
    createdAt: Date;
  }>;
  
  // Stats
  coursesEnrolled: mongoose.Types.ObjectId[];
  coursesCompleted: mongoose.Types.ObjectId[];
  lessonsCompleted: number;
  certificatesEarned: mongoose.Types.ObjectId[];
  totalSpent: number;
  
  // Settings
  emailNotifications: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  preferredCurrency: string;
  
  // Security
  refreshTokens: string[];
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  isActive: boolean;
  isBanned: boolean;
  roles: ('user' | 'creator' | 'admin' | 'moderator')[];
  
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  canAccessPremium(): boolean;
  calculateLevel(): number;
  updateStreak(): Promise<void>;
}

const AffiliateLinkSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  code: { 
    type: String, 
    required: true, 
    unique: true,
    default: () => crypto.randomBytes(6).toString('hex').toUpperCase()
  },
  clicks: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String },
    bio: { type: String, maxlength: 500 },
    
    subscriptionTier: { type: String, enum: ['free', 'premium', 'elite'], default: 'free' },
    subscriptionStatus: { type: String, enum: ['active', 'canceled', 'expired', 'trialing'], default: 'active' },
    subscriptionId: { type: String, sparse: true },
    subscriptionExpiresAt: { type: Date },
    stripeCustomerId: { type: String, sparse: true },
    paystackCustomerCode: { type: String, sparse: true },
    
    walletBalance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streak: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
    badges: [{ type: String }],
    
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    referrals: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    referralEarnings: { type: Number, default: 0 },
    referralLevel: { type: Number, default: 0 },
    
    affiliateLinks: [AffiliateLinkSchema],
    
    coursesEnrolled: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    coursesCompleted: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    lessonsCompleted: { type: Number, default: 0 },
    certificatesEarned: [{ type: Schema.Types.ObjectId, ref: 'Certificate' }],
    totalSpent: { type: Number, default: 0 },
    
    emailNotifications: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    preferredCurrency: { type: String, default: 'NGN' },
    
    refreshTokens: [{ type: String }],
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },
    roles: { type: [String], enum: ['user', 'creator', 'admin', 'moderator'], default: ['user'] },
    
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ 'subscriptionExpiresAt': 1 });
UserSchema.index({ xp: -1 });
UserSchema.index({ roles: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'affiliateLinks.code': 1 });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.referralCode) {
    this.referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  }
  next();
});

UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.canAccessPremium = function(): boolean {
  if (this.subscriptionTier === 'free') return false;
  if (this.subscriptionStatus !== 'active') return false;
  if (this.subscriptionExpiresAt && new Date() > this.subscriptionExpiresAt) return false;
  return true;
};

UserSchema.methods.calculateLevel = function(): number {
  return Math.floor(Math.pow(this.xp / 100, 0.5)) + 1;
};

UserSchema.methods.updateStreak = async function(): Promise<void> {
  const now = new Date();
  const lastActive = this.lastActiveAt || now;
  const daysDiff = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 1) {
    this.streak += 1;
  } else if (daysDiff > 1) {
    this.streak = 1;
  }
  
  this.lastActiveAt = now;
  await this.save();
};

export const User = mongoose.model<IUser>('User', UserSchema);
