const assert = require('assert');
const fs = require('fs');
const path = require('path');
const plan = require('../data/coursera-roadmap-course-plan.json');
const seed = require('../data/coursera-roadmap-course-seed.json');
const { normalizeCourseraUrl, validateSeed } = require('./courseraRoadmapCatalog.utils');
const {
  getRoadmapCourseRecommendations,
  rankCourseForTopic,
  resolveRoadmapTopic,
} = require('../src/services/courseraRoadmapRecommendation.service');

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${passed}: ${name}`); };
const query = (value) => ({ lean: async () => value });
const roadmapModel = (roadmap) => ({ findOne: () => query(roadmap) });
const courseModel = (courses, error) => ({ find: () => ({ lean: async () => { if (error) throw error; return courses; } }) });
const mappedCourse = (topicId, score, suffix = '') => ({
  canonicalUrl: `https://www.coursera.org/learn/course-${score}${suffix}`,
  title: `Course ${score}`, description: 'frontend React UI component development', contentType: 'course',
  level: 'beginner', language: 'en', roadmapTopicMappings: [{ topicId, relevanceScore: score }],
});

(async () => {
  await test('Frontend beginner resolves to frontend-beginner', () => assert.strictEqual(resolveRoadmapTopic({ roleId: 'frontend', effectiveLevel: 'beginner' }).topicId, 'frontend-beginner'));
  await test('Backend beginner resolves to backend-beginner', () => assert.strictEqual(resolveRoadmapTopic({ targetRole: 'Backend Developer', requestedLevel: 'beginner' }).topicId, 'backend-beginner'));
  await test('Resolver does not depend on roadmap item IDs', () => assert.strictEqual(resolveRoadmapTopic({ roleId: 'frontend', effectiveLevel: 'beginner', mainPath: { phases: [{ tasks: [{ itemId: 'anything' }] }] } }).topicId, 'frontend-beginner'));
  await test('Whole-topic relevance determines ranking', () => {
    const topic = plan.roadmapTopics.find((item) => item.topicId === 'frontend-beginner');
    assert(rankCourseForTopic(mappedCourse(topic.topicId, 90), topic) > rankCourseForTopic(mappedCourse(topic.topicId, 50), topic));
  });
  await test('Duplicate canonical URL is rejected by seed validation', () => {
    const duplicateSeed = { courses: [seed.courses[0], { ...seed.courses[0] }] };
    assert(validateSeed(plan, duplicateSeed).some((error) => error.includes('Duplicate canonicalUrl')));
  });
  await test('Valid direct Coursera URL is canonicalized', () => assert.deepStrictEqual(normalizeCourseraUrl('https://coursera.org/learn/test?utm_source=x#about'), { canonicalUrl: 'https://www.coursera.org/learn/test', contentType: 'course', externalId: 'test' }));
  await test('Search, login, lecture and external URLs are rejected', () => ['https://www.coursera.org/search?q=x', 'https://www.coursera.org/login', 'https://www.coursera.org/lecture/x/y', 'https://example.com/learn/x'].forEach((url) => assert.strictEqual(normalizeCourseraUrl(url), null)));
  await test('Roadmap ownership is checked in the database query', async () => {
    let filter;
    const RoadmapModel = { findOne: (value) => { filter = value; return query(null); } };
    await assert.rejects(() => getRoadmapCourseRecommendations('user-a', 'roadmap-a', { RoadmapModel, CourseModel: courseModel([]) }), /Roadmap not found/);
    assert.strictEqual(filter.userId, 'user-a');
  });
  await test('No catalog matches returns courses empty', async () => {
    const result = await getRoadmapCourseRecommendations('user-a', 'roadmap-a', { RoadmapModel: roadmapModel({ _id: 'roadmap-a', roleId: 'frontend', effectiveLevel: 'beginner' }), CourseModel: courseModel([]) });
    assert.deepStrictEqual(result.courses, []);
  });
  await test('Catalog DB failure degrades to courses empty', async () => {
    const result = await getRoadmapCourseRecommendations('user-a', 'roadmap-a', { RoadmapModel: roadmapModel({ _id: 'roadmap-a', roleId: 'frontend', effectiveLevel: 'beginner' }), CourseModel: courseModel([], new Error('db down')) });
    assert.deepStrictEqual(result.courses, []);
  });
  await test('Runtime service and route contain no network or Gemini call', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/services/courseraRoadmapRecommendation.service.js'), 'utf8');
    assert(!/axios|fetch\s*\(|generateJsonWithGemini|generateRoadmapResponse/.test(source));
  });
  await test('Existing roadmap response formatter is not changed by the new service', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/services/roadmap.service.js'), 'utf8');
    assert(source.includes('formatGeneratedRoadmapResponse'));
    assert(!source.includes('courseRecommendations'));
  });
  await test('Course ordering is deterministic', async () => {
    const topicId = 'frontend-beginner';
    const courses = [mappedCourse(topicId, 70, 'b'), mappedCourse(topicId, 70, 'a')];
    const opts = { RoadmapModel: roadmapModel({ _id: 'r', roleId: 'frontend', effectiveLevel: 'beginner' }), CourseModel: courseModel(courses) };
    const one = await getRoadmapCourseRecommendations('u', 'r', opts);
    const two = await getRoadmapCourseRecommendations('u', 'r', { ...opts, CourseModel: courseModel([...courses].reverse()) });
    assert.deepStrictEqual(one, two);
  });
  await test('Topic max course count is respected', async () => {
    const courses = Array.from({ length: 8 }, (_, index) => mappedCourse('frontend-beginner', 90 - index, String(index)));
    const result = await getRoadmapCourseRecommendations('u', 'r', { RoadmapModel: roadmapModel({ _id: 'r', roleId: 'frontend', effectiveLevel: 'beginner' }), CourseModel: courseModel(courses), limit: 99 });
    assert.strictEqual(result.courses.length, 5);
    assert(!Object.hasOwn(result, 'coursesByItem'));
  });
  console.log(`PASS: Coursera roadmap recommendation suite (${passed} checks)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
