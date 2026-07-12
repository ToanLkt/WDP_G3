const assert = require('assert');

const { buildDev2VecAnalysisPayload } = require('../src/services/analysis.service');
const { sanitizeAnalysisSnapshot } = require('../src/services/analysis/analysis.engine');
const {
  parseContributionCodeEvidence,
} = require('../src/services/analysis/contributionCodeEvidence.service');
const {
  shouldUseCachedDev2Vec,
} = require('../src/services/dev2vec/dev2vecCachePolicy.service');
const {
  getCurrentDev2VecPipelineMetadata,
} = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');

const commitFile = (filename, content, evidenceSource = 'commit_patch') => (
  parseContributionCodeEvidence({ filename, content, evidenceSource, file: { filename, additions: 8, changes: 10 } })
);

const baseOutput = (topRoleId, topRoleName, modelLabel, probability = 0.7) => ({
  modelVersion: 'fixture',
  vectorDims: {},
  vectors: {},
  vectorSources: {},
  rolePredictions: [
    { roleId: topRoleId, roleName: topRoleName, modelLabel, rank: 1, probability },
    { roleId: topRoleId === 'frontend' ? 'backend' : 'frontend', roleName: topRoleId === 'frontend' ? 'Backend Developer' : 'Frontend Developer', modelLabel: topRoleId === 'frontend' ? 'Backend' : 'Frontend', rank: 2, probability: 0.2 },
  ],
  skillGaps: {
    frontend: { missingSkillNames: ['React UI', 'Component Design', 'State Management', 'Frontend Testing', 'Responsive Design'] },
    backend: { missingSkillNames: ['REST API', 'Database', 'Authentication', 'Docker Basics', 'API Testing'] },
  },
});

const payloadFor = ({ name, roleOutput, sourceStats, apiTokens = [], repoFeatures = {}, normalizedFiles = [] }) => {
  const commits = normalizedFiles.length
    ? [{ sha: `${name}-sha`, files: normalizedFiles.map((file) => ({ filename: file.filename })), normalizedFiles }]
    : [];
  return buildDev2VecAnalysisPayload({
    repository: { _id: name, githubRepoId: 1, name, fullName: `fixture/${name}`, language: 'TypeScript' },
    packageRecord: { packages: apiTokens, frameworks: [], languages: ['TypeScript'] },
    commits,
    contributionScope: { totalRepoCommits: commits.length },
    githubAccount: { username: 'fixture-user' },
    dev2vecInput: {
      requestId: name,
      apiTokens,
      sourceStats,
      repoFeatureEvidence: repoFeatures,
      evidencePreview: { repoFeatures, docs: {} },
    },
    dev2vecOutput: roleOutput,
    issueEvidence: { issues: [], metadata: {} },
  });
};

const summarize = (payload) => sanitizeAnalysisSnapshot({ _id: 'analysis', ...payload }, { view: 'summary' });
const skillNames = (items) => new Set((items || []).map((item) => item.skill));
const assertNoOverlap = (response) => {
  const top = skillNames(response.topSkills);
  const missing = skillNames(response.missingSkills);
  for (const skill of top) assert(!missing.has(skill), `${skill} appears in both topSkills and missingSkills`);
};
const assertScorePolicy = (response) => {
  assertNoOverlap(response);
  for (const skill of response.topSkills || []) assert(Number(skill.score || 0) > 0, `${skill.skill} top score must be > 0`);
};

const frontendFiles = [
  commitFile('src/pages/Dashboard.tsx', 'import React from "react"; export function Dashboard(){ const [open,setOpen]=React.useState(false); return <main className="grid md:grid-cols-2" /> }'),
  commitFile('src/components/UserCard.tsx', 'import React from "react"; export function UserCard(props:{name:string}){ return <section className="sm:p-4" /> }'),
];
const frontendResponse = summarize(payloadFor({
  name: 'frontend-admin',
  roleOutput: baseOutput('backend', 'Backend Developer', 'Backend', 0.4),
  apiTokens: ['react', 'vite'],
  repoFeatures: { Frontend: { detected: true, evidence: [] } },
  sourceStats: {
    sourceFileCount: 8, apiTokenCount: 2,
    frontendFileCount: 8, backendFileCount: 0,
    userContributionFileCount: 2, userContributionFrontendFileCount: 2, userContributionBackendFileCount: 0,
  },
  normalizedFiles: frontendFiles,
}));
assert.strictEqual(frontendResponse.summary.projectType, 'Frontend');
assert(skillNames(frontendResponse.topSkills).has('React UI'));
assert(skillNames(frontendResponse.topSkills).has('Component Design'));
assert(skillNames(frontendResponse.missingSkills).has('Frontend Testing'));
assertScorePolicy(frontendResponse);

const backendFiles = [
  commitFile('src/routes/user.routes.js', 'const express = require("express"); const router = express.Router(); router.get("/users", controller.list);'),
  commitFile('src/models/User.js', 'const mongoose = require("mongoose"); module.exports = mongoose.model("User", new mongoose.Schema({ email: String }));'),
  commitFile('src/middlewares/auth.middleware.js', 'const jwt = require("jsonwebtoken"); module.exports = function authMiddleware(req,res,next){ jwt.verify(req.headers.authorization, "secret"); }'),
  commitFile('Dockerfile', 'FROM node:20\nCOPY package.json .\nRUN npm install\nCMD ["node","server.js"]'),
];
const backendResponse = summarize(payloadFor({
  name: 'backend-api',
  roleOutput: baseOutput('backend', 'Backend Developer', 'Backend', 0.7),
  apiTokens: ['express', 'mongoose', 'jsonwebtoken'],
  repoFeatures: { Backend: { detected: true, evidence: [] }, 'REST API': { detected: true, evidence: [] } },
  sourceStats: {
    sourceFileCount: 12, apiTokenCount: 3,
    backendFileCount: 10, frontendFileCount: 0,
    userContributionFileCount: 4, userContributionBackendFileCount: 4, userContributionFrontendFileCount: 0,
  },
  normalizedFiles: backendFiles,
}));
assert.strictEqual(backendResponse.summary.projectType, 'Backend');
for (const skill of ['REST API', 'Database', 'Authentication', 'Docker Basics']) {
  assert(skillNames(backendResponse.topSkills).has(skill), `${skill} should be detected`);
  assert(!skillNames(backendResponse.missingSkills).has(skill), `${skill} must not be missing`);
}
assertScorePolicy(backendResponse);

const landingFiles = [
  commitFile('components/Hero.tsx', 'import React from "react"; export function Hero(){ return <section className="grid md:grid-cols-2 lg:px-12" /> }'),
  commitFile('app/page.tsx', 'import React from "react"; export default function Page(){ return <main className="sm:p-4" /> }'),
];
const landingResponse = summarize(payloadFor({
  name: 'landing-page',
  roleOutput: baseOutput('backend', 'Backend Developer', 'Backend', 0.35),
  apiTokens: ['react', 'next'],
  repoFeatures: { Frontend: { detected: true, evidence: [] } },
  sourceStats: {
    sourceFileCount: 4, apiTokenCount: 2,
    frontendFileCount: 4, backendFileCount: 0,
    userContributionFileCount: 2, userContributionFrontendFileCount: 2, userContributionBackendFileCount: 0,
  },
  normalizedFiles: landingFiles,
}));
assert.strictEqual(landingResponse.summary.projectType, 'Frontend');
assert.notStrictEqual(landingResponse.summary.careerDirection, 'Backend Developer');
assert(skillNames(landingResponse.topSkills).has('React UI'));
assertScorePolicy(landingResponse);

const zeroResponse = summarize(payloadFor({
  name: 'zero-source',
  roleOutput: baseOutput('backend', 'Backend Developer', 'Backend', 0.8),
  sourceStats: {
    sourceFileCount: 0, apiTokenCount: 0,
    frontendFileCount: 0, backendFileCount: 0,
    userContributionFileCount: 0, userContributionFrontendFileCount: 0, userContributionBackendFileCount: 0,
  },
  normalizedFiles: [],
}));
assert.notStrictEqual(zeroResponse.summary.projectType, 'Backend');
assert.notStrictEqual(zeroResponse.summary.careerDirection, 'Backend Developer');
assert.deepStrictEqual(zeroResponse.topSkills, []);
assert.deepStrictEqual(zeroResponse.missingSkills, []);

const readmeOnlyResponse = summarize(payloadFor({
  name: 'readme-only',
  roleOutput: baseOutput('frontend', 'Frontend Developer', 'Frontend', 0.55),
  apiTokens: ['react'],
  repoFeatures: { Frontend: { detected: true, evidence: [] } },
  sourceStats: {
    sourceFileCount: 3, apiTokenCount: 1,
    frontendFileCount: 3, backendFileCount: 0,
    userContributionFileCount: 0, userContributionFrontendFileCount: 0, userContributionBackendFileCount: 0,
  },
  normalizedFiles: [],
}));
assert.strictEqual(readmeOnlyResponse.summary.projectType, 'Frontend');
assert(readmeOnlyResponse.topSkills.length === 0);
assert(readmeOnlyResponse.missingSkills.every((skill) => !['REST API', 'Database', 'Authentication'].includes(skill.skill)));

const mixedResponse = summarize(payloadFor({
  name: 'mixed-fullstack',
  roleOutput: baseOutput('backend', 'Backend Developer', 'Backend', 0.6),
  apiTokens: ['express', 'react'],
  repoFeatures: { Backend: { detected: true, evidence: [] }, Frontend: { detected: true, evidence: [] } },
  sourceStats: {
    sourceFileCount: 10, apiTokenCount: 2,
    frontendFileCount: 5, backendFileCount: 5,
    userContributionFileCount: 2, userContributionFrontendFileCount: 2, userContributionBackendFileCount: 0,
  },
  normalizedFiles: frontendFiles,
}));
assert.strictEqual(mixedResponse.summary.careerDirection, 'Frontend Developer');
assert(skillNames(mixedResponse.topSkills).has('React UI'));
assert(!skillNames(mixedResponse.missingSkills).has('REST API'));

const currentMetadata = getCurrentDev2VecPipelineMetadata({ generatedAt: new Date('2026-07-13T00:00:00.000Z') });
const legacyCacheDecision = shouldUseCachedDev2Vec({
  cachedMetadata: { ...currentMetadata, skillMappingVersion: 'canonical-skill-mapping-v2' },
  currentMetadata,
  forceRegenerate: false,
});
assert.strictEqual(legacyCacheDecision.useCache, false);

console.log('PASS: Dev2Vec multi-repository regression matrix');
