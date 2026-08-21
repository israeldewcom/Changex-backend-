// ============================================================
// FILE: src/seed.ts (UPDATED - add Academy, Achievements, Levels)
// ============================================================

import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from './models/User.js';
import Course from './models/Course.js';
import Badge from './models/Badge.js';
import Achievement from './models/Achievement.js';
import Academy from './models/Academy.js';
import LevelConfig from './models/LevelConfig.js';
import bcrypt from 'bcryptjs';
import { generateReferralCode } from './utils/referralCode.js';
import crypto from 'crypto';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Create admin – use env or random password
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(8).toString('hex');
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await User.create({
    email: 'admin@changex.com',
    passwordHash: adminHash,
    firstName: 'Admin',
    lastName: 'User',
    roles: ['admin'],
    referralCode: generateReferralCode(),
  });
  console.log(`✅ Admin created with password: ${adminPassword} (save this!)`);

  // Create sample instructor
  const instructor = await User.create({
    email: 'instructor@changex.com',
    passwordHash: await bcrypt.hash('pass', 12),
    firstName: 'John',
    lastName: 'Doe',
    roles: ['instructor'],
    isApprovedInstructor: true,
    referralCode: generateReferralCode(),
  });

  // ─── SEED ACADEMY ────────────────────────────────────────────────────
  const academy = await Academy.create({
    name: 'ChangeX Academy HQ',
    slug: 'changex-hq',
    description: 'The main academy for ChangeX learning.',
    ownerId: admin._id,
    isPublic: true,
    allowPublicEnrollment: true,
    requireApproval: false,
    subscriptionTier: 'free',
    settings: {
      theme: {
        primaryColor: '#D4AF37',
        secondaryColor: '#FBBF24',
        accentColor: '#B8860B',
        backgroundColor: '#FDF8F0',
        textColor: '#2C2418',
        fontFamily: 'Inter, sans-serif',
        borderRadius: '20px',
        buttonStyle: 'rounded',
        cardStyle: 'glass',
        navigationStyle: 'modern',
        darkMode: false,
      },
    },
  });
  console.log(`✅ Academy created: ${academy.name}`);

  // ─── SEED ACHIEVEMENTS ──────────────────────────────────────────────
  const achievements = [
    {
      name: 'First Steps',
      description: 'Complete your first lesson',
      icon: '👣',
      category: 'learning',
      criteria: { type: 'lessons_completed', target: 1 },
    },
    {
      name: '10 Lessons Completed',
      description: 'Complete 10 lessons',
      icon: '📚',
      category: 'learning',
      criteria: { type: 'lessons_completed', target: 10 },
    },
    {
      name: '100 Lessons Completed',
      description: 'Complete 100 lessons',
      icon: '🎓',
      category: 'learning',
      criteria: { type: 'lessons_completed', target: 100 },
    },
    {
      name: 'Course Conqueror',
      description: 'Complete your first course',
      icon: '🏆',
      category: 'learning',
      criteria: { type: 'courses_completed', target: 1 },
    },
    {
      name: '7-Day Streak',
      description: 'Maintain a 7-day learning streak',
      icon: '🔥',
      category: 'consistency',
      criteria: { type: 'streak_days', target: 7 },
    },
    {
      name: '30-Day Streak',
      description: 'Maintain a 30-day learning streak',
      icon: '🔥',
      category: 'consistency',
      criteria: { type: 'streak_days', target: 30 },
    },
    {
      name: '100-Day Streak',
      description: 'Maintain a 100-day learning streak',
      icon: '🔥',
      category: 'consistency',
      criteria: { type: 'streak_days', target: 100 },
    },
    {
      name: 'XP Earned 5,000',
      description: 'Earn 5,000 XP',
      icon: '⭐',
      category: 'learning',
      criteria: { type: 'xp_earned', target: 5000 },
    },
    {
      name: 'First Post',
      description: 'Create your first post',
      icon: '📝',
      category: 'community',
      criteria: { type: 'posts_created', target: 1 },
    },
    {
      name: 'First Course Created',
      description: 'Create your first course',
      icon: '📖',
      category: 'creation',
      criteria: { type: 'courses_created', target: 1 },
    },
    {
      name: 'First Academy Created',
      description: 'Create your first academy',
      icon: '🏛️',
      category: 'creation',
      criteria: { type: 'academy_created', target: 1 },
    },
    {
      name: 'Earned ₦10,000',
      description: 'Earn ₦10,000 in revenue',
      icon: '💰',
      category: 'career',
      criteria: { type: 'revenue_earned', target: 10000 },
    },
  ];

  for (const a of achievements) {
    await Achievement.findOneAndUpdate({ name: a.name }, a, { upsert: true });
  }
  console.log(`✅ Seeded ${achievements.length} achievements`);

  // ─── SEED LEVEL CONFIG ──────────────────────────────────────────────
  const levels = [
    { level: 1, title: 'Explorer', xpRequired: 0 },
    { level: 2, title: 'Learner', xpRequired: 1000 },
    { level: 3, title: 'Builder', xpRequired: 3000 },
    { level: 4, title: 'Creator', xpRequired: 6000 },
    { level: 5, title: 'Specialist', xpRequired: 10000 },
    { level: 6, title: 'Expert', xpRequired: 15000 },
    { level: 7, title: 'Master', xpRequired: 22000 },
    { level: 8, title: 'ChangeMaker', xpRequired: 30000 },
  ];
  for (const l of levels) {
    await LevelConfig.findOneAndUpdate({ level: l.level }, l, { upsert: true });
  }
  console.log(`✅ Seeded ${levels.length} levels`);

  // ─── SAMPLE COURSE ──────────────────────────────────────────────────
  await Course.create({
    title: 'Introduction to Web Development',
    description: '<p>Learn HTML, CSS, and JavaScript from scratch.</p>',
    category: 'Web Development',
    level: 'Beginner',
    price: 0,
    instructorId: instructor._id,
    approvalStatus: 'approved',
    isPublished: true,
    totalLessons: 3,
    academyId: academy._id,
  });

  // ─── SEED BADGES (legacy, can be replaced by achievements) ──────────
  await Badge.insertMany([
    { name: 'First Course Completed', description: 'Completed your first course', icon: '🎓' },
    { name: '7-Day Streak', description: 'Maintained a 7-day learning streak', icon: '🔥' },
    { name: 'Referral Master', description: 'Referred 5 friends', icon: '👥' },
    { name: 'Big Earner', description: 'Earned ₦50,000 in affiliate commissions', icon: '💰' },
  ]);

  console.log('Seed complete');
  mongoose.connection.close();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
