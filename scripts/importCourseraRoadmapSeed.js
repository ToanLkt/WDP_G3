require('dotenv').config();
const mongoose = require('mongoose');
const CourseraCourse = require('../src/models/CourseraCourse');
const seed = require('../data/coursera-roadmap-course-seed.json');
const plan = require('../data/coursera-roadmap-course-plan.json');
const { validateSeed } = require('./courseraRoadmapCatalog.utils');

const run = async () => {
  const errors = validateSeed(plan, seed);
  if (errors.length) throw new Error(errors.join('\n'));
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI or MONGODB_URI is required');
  await mongoose.connect(mongoUri);
  const operations = seed.courses.map((course) => ({
    updateOne: { filter: { canonicalUrl: course.canonicalUrl }, update: { $set: course }, upsert: true },
  }));
  const result = await CourseraCourse.bulkWrite(operations, { ordered: true });
  console.log(JSON.stringify({ matched: result.matchedCount, modified: result.modifiedCount, upserted: result.upsertedCount, totalSeedCourses: seed.courses.length }, null, 2));
};

run().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => mongoose.disconnect());
