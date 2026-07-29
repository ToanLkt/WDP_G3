const assert = require('assert');
const { selectAnalysisCommitSample } = require('../src/services/analysis.service');
const { selectCommitEvidence } = require('../src/services/github/github.contribution.service');

const commits = Array.from({ length: 1000 }, (_, index) => ({
  sha: `sha-${index}`,
  authorDate: new Date(Date.UTC(2020, 0, 1 + index)).toISOString(),
  authorEmail: 'dev@example.com',
}));
const sampleA = selectAnalysisCommitSample(commits, 400);
const sampleB = selectAnalysisCommitSample([...commits].reverse(), 400);
assert.strictEqual(sampleA.length, 400);
assert.deepStrictEqual(sampleA.map((item) => item.sha), sampleB.map((item) => item.sha));
assert.strictEqual(new Set(sampleA.map((item) => item.sha)).size, 400);
assert.strictEqual(selectAnalysisCommitSample(commits.slice(0, 12), 400).length, 12);
assert.strictEqual(selectCommitEvidence(commits, { username: 'dev', verifiedEmail: 'dev@example.com' }).length, 1000);

for (const count of [399, 400, 401, 900]) {
  const input = commits.slice(0, count);
  assert.strictEqual(selectAnalysisCommitSample(input, 400).length, Math.min(count, 400));
}

const branchCommits = [
  ['main', ['A', 'B', 'C']],
  ['develop', ['A', 'B', 'C', 'D']],
  ['feature/auth', ['A', 'B', 'E']],
];
const uniqueShas = new Set(branchCommits.flatMap(([, shas]) => shas));
assert.deepStrictEqual([...uniqueShas].sort(), ['A', 'B', 'C', 'D', 'E']);
const userOnly = new Set(['D', 'E']);
assert.deepStrictEqual([...uniqueShas].filter((sha) => userOnly.has(sha)).sort(), ['D', 'E']);

const activeDayDates = [
  '2026-01-01T01:00:00Z',
  '2026-01-01T20:00:00Z',
  '2026-01-02T02:00:00Z',
].map((value) => new Date(value).toISOString().slice(0, 10));
assert.strictEqual(new Set(activeDayDates).size, 2);
assert.strictEqual(activeDayDates.sort()[0], '2026-01-01');
assert.strictEqual(activeDayDates[activeDayDates.length - 1], '2026-01-02');
console.log('all-branch commit sampling tests passed');
