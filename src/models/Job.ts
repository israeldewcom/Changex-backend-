// ============================================
// FILE: src/models/Job.ts (unchanged)
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
  title: string;
  description: string;
  company: string;
  companyLogo?: string;
  location: string;
  isRemote: boolean;
  type: 'full-time' | 'part-time' | 'contract' | 'internship' | 'freelance';
  category: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  skills: string[];
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  employer: mongoose.Types.ObjectId;
  applicationEmail: string;
  applicationUrl?: string;
  deadline: Date;
  isActive: boolean;
  isVerified: boolean;
  views: number;
  applications: number;
  featured: boolean;
  featuredUntil?: Date;
  postedAt: Date;
  updatedAt: Date;
}

export interface IApplication extends Document {
  job: mongoose.Types.ObjectId;
  applicant: mongoose.Types.ObjectId;
  coverLetter: string;
  resume: string;
  portfolio?: string;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  appliedAt: Date;
  reviewedAt?: Date;
  notes?: string;
}

const JobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, index: true },
    description: { type: String, required: true },
    company: { type: String, required: true },
    companyLogo: { type: String },
    location: { type: String, required: true },
    isRemote: { type: Boolean, default: false },
    type: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship', 'freelance'], required: true },
    category: { type: String, required: true, index: true },
    salaryMin: { type: Number },
    salaryMax: { type: Number },
    salaryCurrency: { type: String, default: 'NGN' },
    experienceLevel: { type: String, enum: ['entry', 'mid', 'senior', 'lead', 'executive'], required: true },
    skills: [{ type: String, index: true }],
    responsibilities: [{ type: String }],
    requirements: [{ type: String }],
    benefits: [{ type: String }],
    employer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationEmail: { type: String, required: true },
    applicationUrl: { type: String },
    deadline: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    isVerified: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    applications: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    featuredUntil: { type: Date },
    postedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const ApplicationSchema = new Schema<IApplication>(
  {
    job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    applicant: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coverLetter: { type: String, required: true },
    resume: { type: String, required: true },
    portfolio: { type: String },
    status: { type: String, enum: ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'], default: 'pending' },
    appliedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

JobSchema.index({ title: 'text', description: 'text', skills: 'text' });
JobSchema.index({ location: 1, isRemote: 1 });
JobSchema.index({ deadline: 1, isActive: 1 });
JobSchema.index({ postedAt: -1 });
ApplicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

export const Job = mongoose.model<IJob>('Job', JobSchema);
export const Application = mongoose.model<IApplication>('Application', ApplicationSchema);
