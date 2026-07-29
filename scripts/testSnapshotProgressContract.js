const assert = require('assert');
const { buildComparisonResult, buildSnapshotSummary, formatSnapshotResponse } = require('../src/services/snapshot.service');

const makeSnapshot = (id, commits, days, level) => ({
  _id: id,
  repositoryId: 'repo-1',
  repoName: 'demo',
  fullName: 'org/demo',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  analyzedAt: new Date('2026-01-01T00:00:00Z'),
  analysisScope: {
    type: 'user_contribution', githubUsername: 'ToanLkt', totalRepoCommits: commits + 41,
    userCommits: commits, activeDays: days, firstCommitDate: '2026-01-01', lastCommitDate: '2026-01-20',
  },
  summary: { userReadinessScore: 70, userLevel: level, confidence: 0.8 },
  scores: { overallScore: 70 },
  skillVector: [{ skill: 'JavaScript', canonicalSkillName: 'JavaScript', score: 80, level: 'strong' }],
  missingSkills: [],
  scoreBreakdown: { scoringMethod: 'dev2vec_doc2vec_classifier', confidence: 0.8 },
  dev2vec: { modelVersion: 'model-v1', scoringMethod: 'dev2vec_doc2vec_classifier' },
});

const oldSnapshot = makeSnapshot('old', 15, 5, 'beginner');
const latestSnapshot = makeSnapshot('latest', 66, 19, 'intermediate');
const comparison = buildComparisonResult(oldSnapshot, latestSnapshot);
assert.strictEqual(comparison.delta.userCommitsDelta, 51);
assert.strictEqual(comparison.delta.activeDaysDelta, 14);
assert.strictEqual(comparison.toSnapshot.analysisScope.userCommits, 66);
assert.strictEqual(comparison.toSnapshot.analysisScope.activeDays, 19);
assert.strictEqual(comparison.toSnapshot.analysisScope.githubUsername, 'ToanLkt');
assert.ok(Array.isArray(comparison.toSnapshot.topSkills));

const detail = formatSnapshotResponse(latestSnapshot, { view: 'detail' });
assert.strictEqual(detail.analysisScope.userCommits, 66);
assert.strictEqual(detail.analysisScope.activeDays, 19);
assert.strictEqual(detail.analysisScope.githubUsername, 'ToanLkt');

const legacy = buildSnapshotSummary({ repositoryId: 'repo-1', analysisScope: { type: 'user_contribution' }, summary: {} });
assert.strictEqual(legacy.analysisScope.userCommits, undefined);
assert.strictEqual(legacy.analysisScope.githubUsername, undefined);
console.log('snapshot progress contract tests passed');
