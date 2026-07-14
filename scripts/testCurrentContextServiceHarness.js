const assert = require('assert');

const AnalysisResult = require('../src/models/AnalysisResult');
const RepoAnalysisSnapshot = require('../src/models/RepoAnalysisSnapshot');
const LegacyAnalysisSnapshot = require('../src/models/AnalysisSnapshot');
const Repository = require('../src/models/Repository');
const Roadmap = require('../src/models/Roadmap');
const RoadmapProgress = require('../src/models/RoadmapProgress');
const { resolveCurrentContext } = require('../src/services/currentContext.service');

const ids = {
  user: '665f1f000000000000000001', other: '665f1f000000000000000002',
  repo: '665f1f000000000000000010', analysisA: '665f1f000000000000000011',
  analysisB: '665f1f000000000000000012', snapshotA: '665f1f000000000000000013',
  snapshotB: '665f1f000000000000000014', roadmap: '665f1f000000000000000015',
};

const repository = { _id: ids.repo, userId: ids.user, name: 'Owned repo', fullName: 'student/repo' };
const makeAnalysis = (id, date, skill) => ({
  _id: id, userId: ids.user, repositoryId: ids.repo, repoName: 'Owned repo', fullName: 'student/repo',
  analyzedAt: new Date(date), projectType: 'Backend API', careerDirection: 'Backend Developer',
  summary: { userLevel: 'intermediate' },
  skillVector: [{ canonicalSkillName: skill, score: 80, level: 'strong' }],
  missingSkills: ['API Testing'], dev2vec: { rolePredictions: [{ roleId: 'backend', rank: 1 }], skillGaps: { backend: {} } },
});
const analysisA = makeAnalysis(ids.analysisA, '2026-07-01', 'Authentication');
const analysisB = makeAnalysis(ids.analysisB, '2026-07-14', 'REST API');
const snapshotA = { _id: ids.snapshotA, userId: ids.user, repositoryId: ids.repo, analysisResultId: ids.analysisA };
const snapshotB = { _id: ids.snapshotB, userId: ids.user, repositoryId: ids.repo, analysisResultId: ids.analysisB };
const roadmap = {
  _id: ids.roadmap, userId: ids.user, repositoryId: ids.repo, targetRole: 'Backend Developer', effectiveLevel: 'intermediate', language: 'vi',
  roadmapSource: { type: 'user_contribution_analysis', analysisId: ids.analysisA, snapshotId: ids.snapshotA },
  mainRoadmap: { phases: [{ tasks: [{ itemId: 'stable-task-id', title: 'Secure endpoint', canonicalSkillName: 'Authentication' }] }] },
  progressSummary: { totalItems: 1, completedItems: 0, inProgressItems: 0, overallProgress: 0 },
};
const progress = {
  userId: ids.user, roadmapId: ids.roadmap, updatedAt: new Date('2026-07-14T02:00:00Z'),
  items: [{ itemId: 'stable-task-id', title: 'Secure endpoint', canonicalSkillName: 'Authentication', status: 'completed', completedAt: new Date('2026-07-14T01:00:00Z') }],
  progressSummary: { totalItems: 1, completedItems: 1, inProgressItems: 0, overallProgress: 100 }, overallProgress: 100,
};

const query = (value) => ({
  sort() { return this; }, select() { return this; },
  lean() { return Promise.resolve(value); },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});
const originals = new Map();
const stub = (model, method, implementation) => {
  originals.set(`${model.modelName}:${method}`, [model, method, model[method]]);
  model[method] = implementation;
};

stub(Repository, 'findOne', (criteria) => query(String(criteria.userId) === ids.user && String(criteria._id) === ids.repo ? repository : null));
stub(Roadmap, 'findOne', (criteria) => query(String(criteria.userId) === ids.user && String(criteria._id) === ids.roadmap ? roadmap : null));
stub(RoadmapProgress, 'findOne', (criteria) => query(String(criteria.userId) === ids.user && String(criteria.roadmapId) === ids.roadmap ? progress : null));
stub(AnalysisResult, 'findOne', (criteria) => {
  if (String(criteria.userId) !== ids.user) return query(null);
  if (criteria._id) return query(String(criteria._id) === ids.analysisA ? analysisA : String(criteria._id) === ids.analysisB ? analysisB : null);
  if (criteria.repositoryId && String(criteria.repositoryId) !== ids.repo) return query(null);
  return query(analysisB);
});
stub(RepoAnalysisSnapshot, 'findOne', (criteria) => {
  if (String(criteria.userId) !== ids.user) return query(null);
  if (criteria._id) return query(String(criteria._id) === ids.snapshotA ? snapshotA : String(criteria._id) === ids.snapshotB ? snapshotB : null);
  return query(String(criteria.analysisResultId) === ids.analysisA ? snapshotA : snapshotB);
});
stub(LegacyAnalysisSnapshot, 'findOne', () => query(null));

(async () => {
  try {
    const general = await resolveCurrentContext(ids.user, {});
    assert.strictEqual(general.provenance.analysisId, ids.analysisB, 'general context must use latest analysis');
    assert.strictEqual(general.provenance.snapshotId, ids.snapshotB, 'general context must resolve matching snapshot');

    const repoScoped = await resolveCurrentContext(ids.user, { repositoryId: ids.repo, analysisId: ids.analysisA });
    assert.strictEqual(repoScoped.provenance.analysisId, ids.analysisB, 'repository scope must outrank explicit analysis selector');

    const roadmapScoped = await resolveCurrentContext(ids.user, { roadmapId: ids.roadmap, repositoryId: ids.repo });
    assert.strictEqual(roadmapScoped.provenance.analysisId, ids.analysisA, 'roadmap must use pinned analysis');
    assert.strictEqual(roadmapScoped.provenance.snapshotId, ids.snapshotA, 'roadmap must use real pinned snapshot');
    assert.strictEqual(roadmapScoped.progressContext.overallProgress, 100, 'roadmap context must use current progress');
    assert.strictEqual(roadmapScoped.progressContext.completedTasks[0].itemId, 'stable-task-id');

    await assert.rejects(() => resolveCurrentContext(ids.other, { roadmapId: ids.roadmap }), /Roadmap not found/);
    console.log('PASS: current context production-service harness');
  } finally {
    for (const [, [model, method, original]] of originals) model[method] = original;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
