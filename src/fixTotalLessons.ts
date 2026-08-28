// ============================================================
// FILE: src/fixTotalLessons.ts
// One-off repair script: recalculates Course.totalLessons from
// the actual Lesson collection for every course, fixing courses
// that show "0 lessons" (or any wrong count) despite having real
// lesson content.
//
// Run with: npx tsx src/fixTotalLessons.ts
// (mirrors how src/seed.ts is run per package.json's "seed" script)
//
// Safe to run multiple times — it only ever sets totalLessons to
// the true count, never touches lesson content, price, or anything else.
// ============================================================

import mongoose from 'mongoose';
import Course from './models/Course.js';
import Lesson from './models/Lesson.js';

async function fixTotalLessons() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set. Aborting — refusing to guess a connection string.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected.\n');

  const courses = await Course.find({}, { _id: 1, title: 1, totalLessons: 1 });
  console.log(`Found ${courses.length} courses. Checking each against real lesson counts...\n`);

  let fixedCount = 0;
  let alreadyCorrectCount = 0;
  const fixedList: { title: string; before: number; after: number }[] = [];

  for (const course of courses) {
    const realCount = await Lesson.countDocuments({ courseId: course._id });
    const storedCount = course.totalLessons || 0;

    if (realCount !== storedCount) {
      await Course.updateOne({ _id: course._id }, { $set: { totalLessons: realCount } });
      fixedCount++;
      fixedList.push({ title: course.title, before: storedCount, after: realCount });
    } else {
      alreadyCorrectCount++;
    }
  }

  console.log('─'.repeat(60));
  console.log(`✅ Done.`);
  console.log(`   Fixed:            ${fixedCount}`);
  console.log(`   Already correct:  ${alreadyCorrectCount}`);
  console.log('─'.repeat(60));

  if (fixedList.length) {
    console.log('\nCourses that were corrected:\n');
    fixedList.forEach(c => {
      console.log(`  "${c.title}" — was ${c.before}, now ${c.after}`);
    });
  }

  await mongoose.connection.close();
  console.log('\n🔌 Connection closed.');
  process.exit(0);
}

fixTotalLessons().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
