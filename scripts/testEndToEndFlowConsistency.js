const assert = require('assert');

const roadmapService = require('../src/services/roadmap.service');
const roadmapLearningService = require('../src/services/roadmapLearning.service');
const roadmapProgressService = require('../src/services/roadmapProgress.service');
const learningService = require('../src/services/learning.service');
const { buildProgressContext, getTopSkills, getMissingSkills } = require('../src/services/currentContext.service');
const AiFeedback = require('../src/models/AiFeedback');
const { buildAiFeedbackPrompt } = require('../src/services/ai-feedback/aiFeedback.prompt');
const { buildChatContextPrompt } = require('../src/services/ai/chatContext.prompt');

const roadmapData = {
  currentGithubDirection: 'Backend',
  summary: 'Test roadmap',
  mainPath: {
    title: 'Backend path',
    reason: 'skill gap',
    phases: [{
      title: 'Foundation',
      tasks: [
        { title: 'Build API tests', skillName: 'API Testing', description: 'Add integration coverage' },
        { title: 'Secure endpoints', skillName: 'Authentication', description: 'Add authorization checks' },
      ],
    }],
  },
  supportingPaths: [],
};

const payload = roadmapService.normalizeRoadmapPayload({
  userId: '665f1f000000000000000001',
  repositoryId: '665f1f000000000000000002',
  roleId: 'backend',
  requestedLevel: 'beginner',
  effectiveLevel: 'intermediate',
  durationWeeks: 6,
  language: 'vi',
  targetRole: 'Backend Developer',
  roadmapData,
  sourceContextSummary: {},
  roadmapGapContext: { skillGaps: [] },
  roadmapSource: {
    type: 'user_contribution_analysis',
    sourceMode: 'single_repo',
    analysisId: '665f1f000000000000000003',
    snapshotId: '665f1f000000000000000004',
  },
  roleMatch: {},
  skillGapSummary: [],
});

const storedIds = payload.mainRoadmap.phases[0].tasks.map((task) => task.itemId);
assert(storedIds.every(Boolean), 'generated tasks must store itemId');
assert.strictEqual(new Set(storedIds).size, storedIds.length, 'itemId must be unique');

const reloaded = JSON.parse(JSON.stringify({ _id: '665f1f000000000000000010', ...payload }));
const serializedIds = roadmapService.formatGeneratedRoadmapResponse(reloaded).mainRoadmap.phases[0].tasks.map((task) => task.itemId);
assert.deepStrictEqual(serializedIds, storedIds, 'serializer must preserve stored itemId');
reloaded.mainRoadmap.phases[0].tasks.reverse();
const reorderedIds = roadmapService.formatGeneratedRoadmapResponse(reloaded).mainRoadmap.phases[0].tasks.map((task) => task.itemId);
assert.deepStrictEqual(reorderedIds, [...storedIds].reverse(), 'serializer must not recompute itemId after reorder');

const extracted = roadmapLearningService.extractRoadmapTasks(reloaded);
assert.deepStrictEqual(extracted.map((task) => task.itemId), [...storedIds].reverse(), 'learning must use stored itemId');
const learningIdentity = roadmapLearningService.buildLearningQueryFromTask(reloaded, extracted[0]);
assert.strictEqual(learningIdentity.language, 'vi');
const contentIdentity = learningService.buildLearningIdentity(learningIdentity);
const resourceIdentity = learningService.buildResourceQuery(learningIdentity);
assert.strictEqual(contentIdentity.language, resourceIdentity.query.language, 'content/resource language must match roadmap language');

const progressItems = roadmapProgressService.extractRoadmapSkills(reloaded);
progressItems[0].status = 'completed';
progressItems[0].progressPercent = 100;
progressItems[0].completedAt = new Date('2026-07-14T00:00:00.000Z');
progressItems[1].status = 'in_progress';
progressItems[1].progressPercent = 80;
assert.strictEqual(roadmapProgressService.calculateOverallProgress(progressItems), 50, 'only completed tasks affect overall progress');
const progressContext = buildProgressContext(reloaded, {
  items: progressItems,
  overallProgress: 50,
  progressSummary: { totalItems: 2, completedItems: 1, inProgressItems: 1, overallProgress: 50 },
  updatedAt: new Date('2026-07-14T01:00:00.000Z'),
});
assert.strictEqual(progressContext.completedTasks.length, 1);
assert.strictEqual(progressContext.inProgressTasks.length, 1);
assert.strictEqual(progressContext.overallProgress, 50);

const transitionItem = { itemId: 'stable', status: 'not_started', startedAt: null, completedAt: null };
const completedAt = new Date('2026-07-14T03:00:00.000Z');
roadmapProgressService.applyItemStatus(transitionItem, 'completed', undefined, completedAt);
roadmapProgressService.applyItemStatus(transitionItem, 'completed', undefined, new Date('2026-07-14T04:00:00.000Z'));
assert.strictEqual(transitionItem.completedAt.toISOString(), completedAt.toISOString(), 'repeat completion must preserve completedAt');
roadmapProgressService.applyItemStatus(transitionItem, 'not_started', undefined, new Date('2026-07-14T05:00:00.000Z'));
assert.strictEqual(transitionItem.completedAt, null, 'uncomplete must clear completedAt');

const analysis = {
  skillVector: [{ canonicalSkillName: 'REST API', score: 82, level: 'strong' }],
  missingSkills: ['API Testing'],
};
assert.strictEqual(getTopSkills(analysis)[0].canonicalSkillName, 'REST API');
assert.deepStrictEqual(getMissingSkills(analysis), ['API Testing']);

assert(AiFeedback.schema.path('analysisId'), 'feedback provenance analysisId missing');
assert(AiFeedback.schema.path('snapshotId'), 'feedback provenance snapshotId missing');
assert(AiFeedback.schema.path('roadmapId'), 'feedback provenance roadmapId missing');
assert(AiFeedback.schema.path('progressUpdatedAt'), 'feedback provenance progressUpdatedAt missing');
assert.notStrictEqual(AiFeedback.schema.path('analysisSnapshotId').isRequired, true, 'analysis result ID must not be forced into snapshot field');

const feedbackPrompt = buildAiFeedbackPrompt({
  repoName: 'repo', fullName: 'student/repo', projectType: 'Backend API', modelVersion: 'v1', scoringMethod: 'dev2vec',
  topSkills: [{ canonicalSkillName: 'REST API' }], matchedSkillNames: ['REST API'], weakSkillNames: [],
  missingSkillNames: ['API Testing'], recommendedNextSkills: ['API Testing'], sourceStats: {}, vectorSources: {},
  evidencePreview: {}, roadmap: { targetRole: 'Backend Developer' }, progress: progressContext,
});
assert(feedbackPrompt.includes('"overallProgress": 50'), 'feedback prompt must include current roadmap progress');
assert(feedbackPrompt.includes('untrusted reference data'), 'feedback prompt must include prompt-injection boundary');
const chatPrompt = buildChatContextPrompt({
  intent: 'GENERAL', skillScoreContext: { hasSkillScoreData: true }, studentProfile: null, repositories: [],
  analysisSnapshots: [], skillSignals: [], learningRecommendations: [], chatHistory: [], userQuestion: 'Review this',
  selectedContext: { provenance: { analysisId: 'analysis-a' }, progress: progressContext },
});
assert(chatPrompt.includes('analysis-a'), 'chat prompt must include selected provenance context');
assert(chatPrompt.includes('untrusted reference data'), 'chat prompt must include prompt-injection boundary');

console.log('PASS: end-to-end flow consistency contracts');
