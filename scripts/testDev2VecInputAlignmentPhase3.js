const assert = require('assert');

const { buildRepoDocument, MAX_REPO_CHARS } = require('../src/services/dev2vec/repoDocumentBuilder.service');
const { buildApiEvidence, normalizeToken } = require('../src/services/dev2vec/apiEvidenceBuilder.service');
const { buildAttributedIssueDocument } = require('../src/services/dev2vec/issueDocumentBuilder.service');
const { buildDev2VecInputFromRepositoryAnalysis } = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');
const { compareMetadata } = require('../src/services/dev2vec/dev2vecCachePolicy.service');

const selected = {
  accepted: true,
  selectedCommitShas: ['user-1'],
  selectedPullRequests: [{ number: 7 }],
};
const repository = {
  name: 'Aligned', fullName: 'acme/aligned', description: 'A useful service', topics: ['Node'], language: 'JavaScript',
  readme: 'Project context only',
};
const commits = [
  { sha: 'user-1', message: 'feat: user work', files: [{ filename: 'src/user.js' }], normalizedFiles: [{ filename: 'src/user.js', evidenceContent: 'import express from "express";' }] },
  { sha: 'team-1', message: 'secret teammate work', files: [{ filename: 'src/team.js', evidenceContent: 'import leak from "leak";' }] },
];
const pullRequests = [
  { number: 7, relation: 'authored', title: 'User PR', body: 'User body', changedPaths: ['src/pr.js'], files: [{ filename: 'src/pr.js', evidenceContent: 'const x = require("express")' }] },
  { number: 8, relation: 'authored', title: 'Unselected PR', body: 'must disappear', files: [] },
  { number: 9, relation: 'reviewed', title: 'Teammate PR', body: 'must disappear', files: [] },
];

assert.strictEqual(buildRepoDocument({ repository, commits, pullRequests, contributionSummary: { accepted: false } }).repoDocument, '');
const repo = buildRepoDocument({ repository, commits, pullRequests, contributionSummary: selected });
assert(repo.repoDocument.includes('repository: aligned'));
assert(repo.repoDocument.includes('feat: user work'));
assert(repo.repoDocument.includes('user pr') && repo.repoDocument.includes('user body'));
assert(repo.repoDocument.includes('src/user.js') && repo.repoDocument.includes('src/pr.js'));
assert(!repo.repoDocument.includes('secret teammate') && !repo.repoDocument.includes('unselected pr') && !repo.repoDocument.includes('teammate pr'));
assert(!repo.repoDocument.includes('careerdirection') && !repo.repoDocument.includes('rolepredictions'));
assert(repo.repoDocument.length <= MAX_REPO_CHARS);
assert.deepStrictEqual(
  buildRepoDocument({ repository, commits: [...commits].reverse(), pullRequests: [...pullRequests].reverse(), contributionSummary: selected }).repoDocument,
  repo.repoDocument,
);

const dependency = buildApiEvidence([{ path: 'package.json', evidenceContent: JSON.stringify({ dependencies: { Express: '^4', '@Scope/PKG': '1' } }) }]);
assert.deepStrictEqual(dependency.apiTokens, ['@scope/pkg', 'express']);
const imports = (count, token) => Array.from({ length: count }, (_, i) => ({ path: `src/${token}-${i}.js`, evidenceContent: `import x from "${token}/subpath";` }));
const threshold = buildApiEvidence([...imports(4, 'four'), ...imports(5, 'five'), ...imports(6, 'six')]);
assert(!threshold.apiTokens.includes('four'));
assert(threshold.apiTokens.includes('five') && threshold.apiTokens.includes('six'));
assert.deepStrictEqual(threshold.apiTokens, [...threshold.apiTokens].sort());
assert.strictEqual(normalizeToken('./internal'), '');
assert.strictEqual(normalizeToken('https://example.com/a'), '');
assert.strictEqual(normalizeToken('@Scope/PKG/subpath'), '@scope/pkg');
assert(!threshold.apiTokens.some((token) => token.includes(':')));

const issues = [{ number: 2, repositoryFullName: 'acme/aligned', relations: ['commented'], title: 'Relevant', body: 'Body', labels: ['bug'], updatedAt: '2026-01-02', userComments: [{ body: 'mine' }, { body: 'mine 2' }, { body: 'mine 3' }, { body: 'mine 4' }], comments: [{ body: 'teammate' }] }];
const issue = buildAttributedIssueDocument(issues);
assert(issue.issueDocument.includes('relevant') && issue.issueDocument.includes('mine 3'));
assert(!issue.issueDocument.includes('mine 4') && !issue.issueDocument.includes('teammate'));
assert.strictEqual(buildAttributedIssueDocument([{ number: 3, title: 'Unrelated' }]).issueDocument, '');
assert(issue.issueDocument.length <= 30000);

const integrated = buildDev2VecInputFromRepositoryAnalysis({ repository, commits, pullRequests, contributionSummary: selected, issues });
assert.strictEqual(integrated.evidenceChannels.availableChannels.repo, true);
assert.strictEqual(integrated.evidenceChannels.availableChannels.issue, true);
assert.strictEqual(integrated.sourceStats.repoTextLength, integrated.repoDocument.length);
assert.strictEqual(integrated.sourceStats.issueTextLength, integrated.issueDocument.length);
assert.strictEqual(integrated.sourceStats.apiTokenCount, integrated.apiTokens.length);
const denied = buildDev2VecInputFromRepositoryAnalysis({ repository, commits, pullRequests, contributionSummary: { accepted: false }, issues });
assert.strictEqual(denied.repoDocument, '');
assert.deepStrictEqual(denied.apiTokens, []);
assert.strictEqual(denied.evidenceChannels.availableChannels.repo, false);
assert.strictEqual(denied.evidenceChannels.availableChannels.api, false);
assert.strictEqual(getCurrentDev2VecPipelineMetadata().analysisPipelineVersion, 'dev2vec-analysis-pipeline-v12');
assert.strictEqual(compareMetadata({
  ...getCurrentDev2VecPipelineMetadata(), analysisPipelineVersion: 'dev2vec-analysis-pipeline-v9',
}, getCurrentDev2VecPipelineMetadata()), 'pipeline_version_mismatch');

console.log('PASS: Phase 3 training-aligned Dev2Vec input builder');
