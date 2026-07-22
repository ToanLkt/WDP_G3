const fs = require('fs');
const path = require('path');
const plan = require('../data/coursera-roadmap-course-plan.json');
const seed = require('../data/coursera-roadmap-course-seed.json');
const { deterministicJson, sha256, validateSeed } = require('./courseraRoadmapCatalog.utils');

const errors = validateSeed(plan, seed);
if (errors.length) {
  errors.forEach((error) => console.error(`FAIL: ${error}`));
  process.exitCode = 1;
} else {
  const counts = Object.fromEntries(plan.roadmapTopics.map((topic) => [topic.topicId, seed.courses.filter((course) => course.roadmapTopicMappings.some((mapping) => mapping.topicId === topic.topicId)).length]));
  console.log(`PASS: ${seed.courses.length} unique direct courses across ${plan.roadmapTopics.length} roadmap topics`);
  console.log(JSON.stringify(counts, null, 2));
  console.log(`seedSha256=${sha256(deterministicJson(seed))}`);
}
