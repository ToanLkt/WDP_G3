const fs = require('fs');
const path = require('path');
const plan = require('../data/coursera-roadmap-course-plan.json');
const checkedInSeed = require('../data/coursera-roadmap-course-seed.json');
const { deterministicJson, normalizeCourseraUrl, sha256, validateSeed } = require('./courseraRoadmapCatalog.utils');

const ROOT = path.resolve(__dirname, '..');
const SEED_PATH = path.join(ROOT, 'data', 'coursera-roadmap-course-seed.json');
const REPORT_PATH = path.join(ROOT, 'data', 'coursera-roadmap-crawl-report.json');

// Discovery results are intentionally supplied as reviewed candidates. This script
// never guesses slugs and is never imported by production code.
const run = async () => {
  const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
  const verifyRemote = process.argv.includes('--verify-remote');
  const input = inputArg ? JSON.parse(fs.readFileSync(path.resolve(inputArg.slice(8)), 'utf8')) : checkedInSeed;
  const deduped = new Map();
  for (const course of input.courses || []) {
    const normalized = normalizeCourseraUrl(course.canonicalUrl);
    if (!normalized) continue;
    const previous = deduped.get(normalized.canonicalUrl);
    const mappings = [...(previous?.roadmapTopicMappings || []), ...(course.roadmapTopicMappings || [])]
      .sort((a, b) => a.topicId.localeCompare(b.topicId));
    deduped.set(normalized.canonicalUrl, { ...previous, ...course, ...normalized, canonicalUrl: normalized.canonicalUrl, roadmapTopicMappings: [...new Map(mappings.map((item) => [item.topicId, item])).values()] });
  }
  const courses = [...deduped.values()].sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
  const remoteResults = [];
  if (verifyRemote) {
    for (const course of courses) {
      try {
        const response = await fetch(course.canonicalUrl, { redirect: 'follow', headers: { 'user-agent': 'WDP-Coursera-Offline-Catalog/1.0' } });
        remoteResults.push({ canonicalUrl: course.canonicalUrl, status: response.status, valid: response.ok && !/login|challenge|captcha/i.test(response.url) });
      } catch (error) { remoteResults.push({ canonicalUrl: course.canonicalUrl, status: 0, valid: false, error: error.message }); }
    }
  }
  const seed = { version: 'coursera-roadmap-course-seed-v1', generatedAt: '2026-07-23T00:00:00+07:00', courses };
  const errors = validateSeed(plan, seed);
  if (errors.length) throw new Error(errors.join('\n'));
  const report = {
    version: 'coursera-roadmap-crawl-report-v1', generatedAt: '2026-07-23T00:00:00+07:00',
    mode: verifyRemote ? 'reviewed_candidates_with_remote_validation' : 'reviewed_candidates_local_validation',
    topicCount: plan.roadmapTopics.length, inputCourseCount: (input.courses || []).length, uniqueCourseCount: courses.length,
    validDirectUrlCount: courses.length, rejectedCount: (input.courses || []).length - courses.length,
    remoteResults, seedSha256: sha256(deterministicJson(seed)),
    coursesPerTopic: Object.fromEntries(plan.roadmapTopics.map((topic) => [topic.topicId, courses.filter((course) => course.roadmapTopicMappings.some((mapping) => mapping.topicId === topic.topicId)).length])),
  };
  fs.writeFileSync(SEED_PATH, deterministicJson(seed));
  fs.writeFileSync(REPORT_PATH, deterministicJson(report));
  console.log(`PASS: ${courses.length} unique courses; ${plan.roadmapTopics.length} topics; network=${verifyRemote}`);
};

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
