const assert = require('assert');

const {
  buildDev2VecInputFromRepositoryAnalysis,
  buildDev2VecInputFromAnalysisSource,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');

const commits = Array.from({ length: 12 }, (_, index) => ({
  sha: `abcdef${index}`,
  message: index === 0 ? 'feat: add REST API controller' : `commit ${index}`,
  authorDate: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
  files: Array.from({ length: 12 }, (__, fileIndex) => ({
    filename: `src/modules/api/file-${index}-${fileIndex}.js`,
  })),
  normalizedFiles: index === 0 ? [{
    filename: 'package.json',
    evidenceContent: JSON.stringify({ dependencies: { Express: '^4', Mongoose: '^8', JSONWebToken: '^9' } }),
  }] : [],
}));

const issues = Array.from({ length: 12 }, (_, index) => ({
  number: index + 1,
  title: index === 0 ? 'Authentication endpoint returns 401' : `Issue ${index}`,
  body: 'The API login flow fails for valid credentials.',
  labels: [{ name: 'bug' }, { name: 'backend' }],
  relations: ['authored'],
  userComments: [{ body: 'Please check token validation middleware.' }],
  state: 'open',
  htmlUrl: `https://github.com/example/project/issues/${index + 1}`,
}));

const input = buildDev2VecInputFromRepositoryAnalysis({
  requestId: 'builder-smoke',
  topN: 99,
  repository: {
    name: 'career-api',
    fullName: 'example/career-api',
    description: 'Node.js career roadmap backend',
    topics: ['nodejs', 'rest-api'],
    language: 'JavaScript',
    defaultBranch: 'main',
    readme: {
      contentPreview: 'Express API with JWT authentication and MongoDB.',
    },
  },
  packages: [{
    packageFiles: ['package.json', 'Dockerfile'],
    packages: ['Express', 'Mongoose', 'JSONWebToken', 'express'],
    dependencies: {
      bcryptjs: '^2.4.3',
      mongoose: '^8.0.0',
    },
    devDependencies: {
      nodemon: '^3.0.0',
    },
    frameworks: ['Express'],
    configs: ['Dockerfile'],
  }],
  commits,
  issues,
  contributionSummary: { accepted: true, selectedCommitShas: commits.map((commit) => commit.sha), selectedPullRequests: [] },
  analysisSource: {
    summary: {
      careerDirection: 'Backend Developer',
      projectType: 'REST API',
    },
    topSkills: [{ skill: 'REST API' }],
  },
});

assert.strictEqual(input.requestId, 'builder-smoke');
assert.strictEqual(input.topN, 3);
assert(input.repoDocument.includes('career-api'));
assert(input.repoDocument.includes('feat: add rest api controller'));
assert(input.repoDocument.includes('src/modules/api/file-0-0.js'));
assert(input.issueDocument.includes('authentication endpoint returns 401'));
assert(input.issueDocument.includes('token validation middleware'));
assert(input.apiTokens.includes('express'));
assert(input.apiTokens.includes('mongoose'));
assert(input.apiTokens.includes('jsonwebtoken'));
assert.strictEqual(input.apiTokens.filter((token) => token === 'express').length, 1);
assert.strictEqual(input.sourceStats.commitCount, 12);
assert.strictEqual(input.sourceStats.issueCount, 12);
assert.strictEqual(input.sourceStats.packageFileCount, 2);
assert.strictEqual(input.evidencePreview.commits.length, 10);
assert.strictEqual(input.evidencePreview.issues.length, 10);
assert.strictEqual(input.evidencePreview.commits[0].changedFiles.length, 10);
assert(input.evidencePreview.apiTokens.length <= 30);

const analysisSourceInput = buildDev2VecInputFromAnalysisSource({
  requestId: 'analysis-source-smoke',
  repoName: 'source-repo',
  fullName: 'example/source-repo',
  latestAnalysis: {
    packages: ['React', 'Vite'],
    frameworks: ['React'],
  },
});

assert.strictEqual(analysisSourceInput.requestId, 'analysis-source-smoke');
assert.strictEqual(analysisSourceInput.repoDocument, '');
assert.deepStrictEqual(analysisSourceInput.apiTokens, []);

console.log('PASS: Dev2Vec input builder smoke test');
