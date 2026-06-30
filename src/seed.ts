import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from './models/User.js';
import Course from './models/Course.js';
import Badge from './models/Badge.js';
import bcrypt from 'bcryptjs';
import { generateReferralCode } from './utils/referralCode.js';
import crypto from 'crypto';

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Create admin – use env or random password
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(8).toString('hex');
  const adminHash = await bcrypt.hash(adminPassword, 12);
  await User.create({
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

  // Create sample course
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
  });

  // Seed badges
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
