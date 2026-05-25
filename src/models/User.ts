// ============================================
// FILE: src/models/User.ts (Existing + Advanced)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

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
  
  // Wallet & Earnings
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
  
  // Referral System
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  referrals: mongoose.Types.ObjectId[];
  referralEarnings: number;
  referralLevel: number;
  referralCount: number;
  
  // Affiliate System
  affiliateLinks: Array<{
    courseId: mongoose.Types.ObjectId;
    courseTitle?: string;
    link: string;
    code: string;
    clicks: number;
    signups: number;
    conversions: number;
    commissionRate: number;
    totalEarned: number;
    createdAt: Date;
  }>;
  
  // Learning Progress
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
  
  // Instructor
  isApprovedInstructor: boolean;
  instructorBio?: string;
  instructorWebsite?: string;
  instructorSocialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    youtube?: string;
  };
  totalStudents: number;
  totalCoursesRevenue: number;
  
  // Onboarding
  setupDone?: boolean;
  welcomeBonusGiven?: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
  
  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  canAccessPremium(): boolean;
  calculateLevel(): number;
  updateStreak(): Promise<void>;
  addXP(amount: number): Promise<void>;
  getReferralLink(): string;
}

const AffiliateLinkSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  courseTitle: { type: String },
  link: { type: String, required: true },
  code: { type: String, required: true, unique: true, sparse: true },
  clicks: { type: Number, default: 0 },
  signups: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  commissionRate: { type: Number, default: 15 },
  totalEarned: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const InstructorSocialLinksSchema = new Schema({
  twitter: { type: String },
  linkedin: { type: String },
  github: { type: String },
  youtube: { type: String },
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
    
    // Subscription
    subscriptionTier: { type: String, enum: ['free', 'premium', 'elite'], default: 'free' },
    subscriptionStatus: { type: String, enum: ['active', 'canceled', 'expired', 'trialing'], default: 'active' },
    subscriptionId: { type: String, sparse: true },
    subscriptionExpiresAt: { type: Date },
    stripeCustomerId: { type: String, sparse: true },
    paystackCustomerCode: { type: String, sparse: true },
    
    // Wallet & Earnings
    walletBalance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    
    // Gamification
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streak: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: Date.now },
    badges: [{ type: String }],
    
    // Referral System
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    referrals: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    referralEarnings: { type: Number, default: 0 },
    referralLevel: { type: Number, default: 0 },
    referralCount: { type: Number, default: 0 },
    
    // Affiliate System
    affiliateLinks: [AffiliateLinkSchema],
    
    // Learning Progress
    coursesEnrolled: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    coursesCompleted: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    lessonsCompleted: { type: Number, default: 0 },
    certificatesEarned: [{ type: Schema.Types.ObjectId, ref: 'Certificate' }],
    totalSpent: { type: Number, default: 0 },
    
    // Settings
    emailNotifications: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String },
    preferredCurrency: { type: String, default: 'NGN' },
    
    // Security
    refreshTokens: [{ type: String }],
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },
    roles: { type: [String], enum: ['user', 'creator', 'admin', 'moderator'], default: ['user'] },
    
    // Instructor
    isApprovedInstructor: { type: Boolean, default: false },
    instructorBio: { type: String, maxlength: 1000 },
    instructorWebsite: { type: String },
    instructorSocialLinks: InstructorSocialLinksSchema,
    totalStudents: { type: Number, default: 0 },
    totalCoursesRevenue: { type: Number, default: 0 },
    
    // Onboarding
    setupDone: { type: Boolean, default: false },
    welcomeBonusGiven: { type: Boolean, default: false },
    
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ subscriptionExpiresAt: 1 });
UserSchema.index({ xp: -1 });
UserSchema.index({ roles: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'affiliateLinks.code': 1 }, { unique: true, sparse: true });

// Pre-save middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Methods
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
  const today = new Date().toDateString();
  const lastActive = this.lastActiveAt?.toDateString();
  if (lastActive === today) return;
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  
  if (lastActive === yesterdayStr) {
    this.streak += 1;
  } else {
    this.streak = 1;
  }
  this.lastActiveAt = new Date();
  await this.save();
};

UserSchema.methods.addXP = async function(amount: number): Promise<void> {
  this.xp += amount;
  const newLevel = this.calculateLevel();
  if (newLevel > this.level) {
    this.level = newLevel;
    const levelBonus = newLevel * 100;
    this.xp += levelBonus;
  }
  await this.save();
};

UserSchema.methods.getReferralLink = function(): string {
  return `${process.env.FRONTEND_URL}/?ref=${this.referralCode}`;
};

export const User = mongoose.model<IUser>('User', UserSchema);
