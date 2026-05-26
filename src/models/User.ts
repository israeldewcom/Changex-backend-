import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  firstName: String, lastName: String, displayName: String, avatar: String, bio: String,
  subscriptionTier: { type: String, enum: ['free', 'premium', 'elite'], default: 'free' },
  subscriptionStatus: { type: String, enum: ['active', 'canceled', 'expired'], default: 'active' },
  subscriptionExpiresAt: Date,
  walletBalance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  pendingWithdrawal: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastActiveAt: { type: Date, default: Date.now },
  badges: [String],
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referrals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  referralEarnings: { type: Number, default: 0 },
  referralLevel: { type: Number, default: 0 },
  affiliateLinks: [{
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    code: String,
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  coursesEnrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  coursesCompleted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  lessonsCompleted: { type: Number, default: 0 },
  certificatesEarned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Certificate' }],
  totalSpent: { type: Number, default: 0 },
  emailNotifications: { type: Boolean, default: true },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  preferredCurrency: { type: String, default: 'NGN' },
  refreshTokens: [String],
  passwordResetToken: String, passwordResetExpires: Date,
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  roles: { type: [String], enum: ['user', 'creator', 'admin', 'moderator'], default: ['user'] },
  isApprovedInstructor: { type: Boolean, default: false },
  lastLoginAt: Date
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.referralCode) this.referralCode = crypto.randomBytes(6).toString('hex').toUpperCase();
  next();
});
UserSchema.methods.comparePassword = async function(candidate: string) { return bcrypt.compare(candidate, this.password); };
UserSchema.methods.updateStreak = async function() {
  const now = new Date();
  const diff = Math.floor((now.getTime() - (this.lastActiveAt || now).getTime()) / (1000*60*60*24));
  if (diff === 1) this.streak += 1;
  else if (diff > 1) this.streak = 1;
  this.lastActiveAt = now;
  await this.save();
};

export const User = mongoose.model('User', UserSchema);
