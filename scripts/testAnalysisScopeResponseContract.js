const assert = require('assert');
const { buildAnalysisScopeSummary } = require('../src/services/analysis/analysis.engine');

const current = buildAnalysisScopeSummary({
  analysisScope: {
    type: 'user_contribution', githubUsername: 'ToanLkt', totalRepoCommits: 107, userCommits: 66,
    activeDays: 19, firstCommitDate: '2026-01-01', lastCommitDate: '2026-01-20', analyzedCommitShas: [],
    source: 'dev2vec', commitScope: 'all_branches', branchesDiscovered: 8, branchesAnalyzed: 8,
    fetchComplete: true, fetchTruncated: false, failedBranches: [], analysisLimit: 400,
    analyzedSampleCommits: 66, selectionStrategy: 'temporal_stratified_sha_dedupe',
    activeDayDateSource: 'authorDate', activeDayTimezone: 'UTC',
  },
});
assert.strictEqual(current.commitScope, 'all_branches');
assert.strictEqual(current.analyzedSampleCommits, 66);
assert.strictEqual(current.fetchComplete, true);
assert.deepStrictEqual(current.failedBranches, []);

const zeroValues = buildAnalysisScopeSummary({ analysisScope: {
  type: 'user_contribution', totalRepoCommits: 0, userCommits: 0, activeDays: 0,
  analyzedSampleCommits: 0, fetchComplete: false, fetchTruncated: false, failedBranches: [],
} });
assert.strictEqual(zeroValues.userCommits, 0);
assert.strictEqual(zeroValues.analyzedSampleCommits, 0);
assert.strictEqual(zeroValues.fetchComplete, false);

const legacy = buildAnalysisScopeSummary({
  analysisScope: { type: 'user_contribution', userCommits: 3, activeDays: 2 },
  commitSummary: { totalCommits: 3, activeDays: 2 },
});
assert.strictEqual(legacy.userCommits, 3);
assert.strictEqual(legacy.commitScope, undefined);
assert.strictEqual(legacy.analyzedSampleCommits, undefined);
console.log('analysis scope response contract tests passed');
