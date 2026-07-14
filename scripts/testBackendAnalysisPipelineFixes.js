const assert = require('assert');
const {
  normalizeCommitDetail,
  isCommitDetailCacheFresh,
} = require('../src/services/github/github.commit.service');
const { resolveEffectiveRole, normalizeRoleId } = require('../src/services/analysis/effectiveRoleResolver');
const { buildAnalysisSkillsFromDev2Vec, buildAnalysisSummaryFromDev2Vec } = require('../src/services/dev2vec/dev2vecRoleMapper.service');
const { buildDev2VecAnalysisPayload } = require('../src/services/analysis.service');
const { validateDev2VecOutput } = require('../src/services/dev2vec/dev2vec.service');
const { sanitizeAnalysisSnapshot } = require('../src/services/analysis/analysis.engine');
const {
  EVIDENCE_VERSION,
  FILE_SELECTION_VERSION,
  addedPatchText,
  isEligibleContributionFile,
  parseContributionCodeEvidence,
  selectContributionCodeEvidenceFiles,
} = require('../src/services/analysis/contributionCodeEvidence.service');
const { buildNormalizedCommitCodeEvidence } = require('../src/services/github/github.commit.service');
const axios = require('axios');

const reactPatch = addedPatchText('@@ -0,0 +1,3 @@\n+import React from "react";\n+import axios from "axios";\n+export function UsersPage() {}\n-old code');
const reactEvidence = parseContributionCodeEvidence({ filename: 'src/pages/UsersPage.tsx', content: reactPatch, evidenceSource: 'commit_patch' });
assert(reactEvidence.detectedRoleSignals.includes('frontend'));
assert(reactEvidence.detectedFrameworks.includes('react'));
assert(reactEvidence.detectedPatterns.includes('frontend_api_client'));
assert(!reactEvidence.detectedPatterns.includes('backend_route'));
assert.strictEqual(Object.prototype.hasOwnProperty.call(reactEvidence, 'content'), false);

const routerEvidence = parseContributionCodeEvidence({ filename: 'src/routes/AppRoutes.tsx', content: 'import { Route } from "react-router-dom"; export const AppRoutes = () => <Route />;' });
assert(routerEvidence.detectedPatterns.includes('frontend_routing'));
assert(!routerEvidence.detectedRoleSignals.includes('backend'));
const expressEvidence = parseContributionCodeEvidence({ filename: 'src/routes/users.js', content: 'const express = require("express"); const router = express.Router(); router.get("/users", handler);' });
assert(expressEvidence.detectedRoleSignals.includes('backend'));
assert(expressEvidence.detectedFrameworks.includes('express'));
const mongooseEvidence = parseContributionCodeEvidence({ filename: 'src/models/User.js', content: 'const mongoose = require("mongoose"); module.exports = mongoose.model("User", new mongoose.Schema({}));' });
assert(mongooseEvidence.detectedPatterns.includes('backend_database'));
const readmeEvidence = parseContributionCodeEvidence({ filename: 'README.md', content: '# docs' });
assert.deepStrictEqual(readmeEvidence.detectedRoleSignals, []);
assert.strictEqual(isEligibleContributionFile('package-lock.json'), false);
assert.strictEqual(isEligibleContributionFile('public/logo.png'), false);
assert.strictEqual(isEligibleContributionFile('.agents/skills/frontend.md'), false);
assert.strictEqual(isEligibleContributionFile('docs/setup.md'), false);
assert.strictEqual(isEligibleContributionFile('README.md'), false);

const selectionFixture = [
  ...Array.from({ length: 20 }, (_, index) => ({
    filename: `.agents/skills/skill-${index}.md`, status: 'added', additions: 20, changes: 20, patch: '+docs',
  })),
  { filename: 'README.md', status: 'modified', additions: 8, changes: 8, patch: '+readme' },
  { filename: 'ADMIN_WEB_HANDOFF.md', status: 'modified', additions: 8, changes: 8, patch: '+handoff' },
  { filename: 'skills-lock.json', status: 'modified', additions: 8, changes: 8, patch: '+lock' },
  { filename: 'package-lock.json', status: 'modified', additions: 8, changes: 8, patch: '+lock' },
  { filename: 'public/logo.png', status: 'added', additions: 0, changes: 0 },
  ...Array.from({ length: 25 }, (_, index) => ({
    filename: index === 0 ? 'src/components/UserCard.tsx'
      : index === 1 ? 'src/features/users/UserList.tsx'
        : index === 2 ? 'src/pages/Dashboard.tsx'
          : index === 3 ? 'src/routes/AppRoutes.tsx'
            : index === 4 ? 'src/main.tsx'
              : `src/components/Generated${index}.tsx`,
    status: 'modified',
    additions: 5 + index,
    changes: 6 + index,
    patch: '+import React from "react";\n+export const Component = () => <section />;',
  })),
  { filename: 'src/styles/global.css', status: 'modified', additions: 4, changes: 4, patch: '+.app { display: flex; }' },
  { filename: 'src/styles/theme.scss', status: 'modified', additions: 4, changes: 4, patch: '+$color: red;' },
  { filename: 'package.json', status: 'modified', additions: 3, changes: 3, patch: '+"react": "^18.0.0"' },
  { filename: 'vite.config.ts', status: 'modified', additions: 3, changes: 3, patch: '+import { defineConfig } from "vite";' },
  { filename: 'tailwind.config.ts', status: 'modified', additions: 3, changes: 3, patch: '+export default { content: [] };' },
  ...Array.from({ length: 5 }, (_, index) => ({
    filename: `src/hooks/useLateSource${index}.ts`,
    status: 'modified',
    additions: 7,
    changes: 7,
    patch: '+export function useLateSource() { return true; }',
  })),
];
const selection = selectContributionCodeEvidenceFiles(selectionFixture, 0);
const selectedNames = selection.selected.map((file) => file.filename);
assert.strictEqual(selection.selected.filter((file) => file.filename.startsWith('.agents/')).length, 0);
assert(selectedNames.some((name) => name.endsWith('.tsx')));
assert(selectedNames.includes('src/components/UserCard.tsx'));
assert(selectedNames.includes('src/features/users/UserList.tsx'));
assert(selectedNames.includes('src/pages/Dashboard.tsx'));
assert(selectedNames.includes('src/routes/AppRoutes.tsx'));
assert(selectedNames.includes('src/main.tsx'));
assert(selectedNames.includes('src/styles/global.css'));
assert(selectedNames.includes('package.json'));
assert(selectedNames.includes('vite.config.ts'));
assert(selectedNames.includes('tailwind.config.ts'));
assert(selectedNames.includes('src/hooks/useLateSource0.ts'));
assert.strictEqual(selection.selected.length, 35);
assert.strictEqual(selection.metadata.ignoredFiles, 25);
assert.strictEqual(selection.metadata.eligibleFiles, 35);
assert.strictEqual(selection.metadata.selectedFiles, 35);
assert.strictEqual(selection.metadata.countLimitApplied, false);
assert(selection.metadata.groupCounts.source > 0);

const allEligibleFixture = [
  ...Array.from({ length: 30 }, (_, index) => ({
    filename: index % 2 === 0 ? `.agents/skills/ignored-${index}.md` : `docs/ignored-${index}.md`,
    status: 'added',
    additions: 3,
    changes: 3,
    patch: '+docs',
  })),
  ...Array.from({ length: 45 }, (_, index) => ({
    filename: `src/components/Middle${index}.tsx`,
    status: 'modified',
    additions: 2,
    changes: 2,
    patch: '+import React from "react";\n+export const Middle = () => <div />;',
  })),
  ...Array.from({ length: 45 }, (_, index) => ({
    filename: `src/hooks/useLate${index}.ts`,
    status: 'modified',
    additions: 2,
    changes: 2,
    patch: '+export function useLate() { return true; }',
  })),
];
const allEligibleSelection = selectContributionCodeEvidenceFiles(allEligibleFixture, 0);
assert.strictEqual(allEligibleSelection.metadata.ignoredFiles, 30);
assert.strictEqual(allEligibleSelection.metadata.eligibleFiles, 90);
assert.strictEqual(allEligibleSelection.metadata.selectedFiles, 90);
assert(allEligibleSelection.selected.some((file) => file.filename === 'src/hooks/useLate44.ts'));

const files = Array.from({ length: 60 }, (_, index) => ({
  filename: `src/file-${index}.tsx`, status: 'modified', additions: 2, deletions: 1, changes: 3, patch: 'large patch',
}));
const detail = normalizeCommitDetail({ detail: { stats: { additions: 120, deletions: 10, total: 130 }, files }, maxFiles: 10 });
assert.strictEqual(detail.additions, 120);
assert.strictEqual(detail.deletions, 10);
assert.strictEqual(detail.changedFiles, 60);
assert.strictEqual(detail.files.length, 10);
assert.strictEqual(detail.files[0].patch, undefined);
assert.strictEqual(detail.detailStatus, 'available');
assert.strictEqual(isCommitDetailCacheFresh(detail), true);

const frontend = resolveEffectiveRole({
  repositoryRole: 'Frontend', userContributionRole: 'Frontend Developer', classifierRole: 'Backend Developer',
  userContributionEvidence: { topFileCount: 5, competingFileCount: 0 }, classifierConfidence: 0.4,
});
assert.strictEqual(frontend.effectiveRoleId, 'frontend');
assert.strictEqual(frontend.effectiveRoleName, 'Frontend Developer');
const frontendWithMinorNoise = resolveEffectiveRole({
  repositoryRole: 'Frontend', userContributionRole: 'Frontend Developer', classifierRole: 'Backend Developer',
  userContributionEvidence: { topFileCount: 14, competingFileCount: 3 }, classifierConfidence: 0.404059,
});
assert.strictEqual(frontendWithMinorNoise.effectiveRoleId, 'frontend');
assert.strictEqual(normalizeRoleId('Frontend'), 'frontend');
assert.strictEqual(normalizeRoleId('Frontend Developer'), 'frontend');
assert.strictEqual(normalizeRoleId('frontend-developer'), 'frontend');

const readmeOnly = resolveEffectiveRole({
  repositoryRole: 'Frontend', userContributionRole: '', classifierRole: 'Backend Developer',
  userContributionEvidence: { topFileCount: 0, competingFileCount: 0 },
});
assert.strictEqual(readmeOnly.effectiveRoleId, 'backend');

const mixed = resolveEffectiveRole({
  repositoryRole: 'Frontend', userContributionRole: 'Frontend Developer', classifierRole: 'Backend Developer',
  userContributionEvidence: { topFileCount: 4, competingFileCount: 4 },
});
assert.strictEqual(mixed.effectiveRoleId, 'backend');

const backend = resolveEffectiveRole({
  repositoryRole: 'Backend', userContributionRole: 'Backend Developer', classifierRole: 'Frontend Developer',
  userContributionEvidence: { topFileCount: 8, competingFileCount: 0 },
});
assert.strictEqual(backend.effectiveRoleId, 'backend');

const output = {
  rolePredictions: [
    { roleId: 'backend', roleName: 'Backend Developer', rank: 1 },
    { roleId: 'frontend', roleName: 'Frontend Developer', rank: 2 },
  ],
  skillGaps: {
    backend: { missingSkillNames: ['REST API', 'Database'] },
    frontend: { matchedSkillNames: ['React Router'], missingSkillNames: ['Accessibility'] },
  },
};
const skills = buildAnalysisSkillsFromDev2Vec(output, { roleId: frontend.effectiveRoleId });
const effectiveSummary = buildAnalysisSummaryFromDev2Vec(output, { roleId: frontend.effectiveRoleId });
assert.strictEqual(effectiveSummary.careerDirection, 'Frontend Developer');
assert.deepStrictEqual(skills.topSkills.map((item) => item.canonicalSkillName), ['React Router']);
assert.deepStrictEqual(skills.missingSkills.map((item) => item.canonicalSkillName), ['Accessibility']);
assert(!skills.recommendations.includes('REST API'));

const scoredSkills = buildAnalysisSkillsFromDev2Vec({
  rolePredictions: [{ roleId: 'frontend', roleName: 'Frontend Developer', rank: 1 }],
  skillGaps: {
    frontend: {
      matchedSkillNames: ['React UI'],
      missingSkillNames: ['Component Design'],
      details: [
        { skillName: 'React UI', canonicalSkillName: 'React UI', similarity: 0.8765, status: 'matched' },
        { skillName: 'Component Design', canonicalSkillName: 'Component Design', similarity: 0.1234, status: 'missing' },
      ],
    },
  },
}, { roleId: 'frontend' });
assert.strictEqual(scoredSkills.topSkills[0].score, 87.65);
assert.strictEqual(scoredSkills.topSkills[0].similarity, 0.8765);
assert.strictEqual(scoredSkills.missingSkills[0].score, 0);

const noFrontendPrediction = {
  rolePredictions: [{ roleId: 'backend', roleName: 'Backend Developer', rank: 1, probability: 0.4 }],
  skillGaps: { backend: { missingSkillNames: ['REST API'] } },
};
assert.strictEqual(buildAnalysisSummaryFromDev2Vec(noFrontendPrediction, { roleId: 'frontend' }).careerDirection, '');
assert.deepStrictEqual(buildAnalysisSkillsFromDev2Vec(noFrontendPrediction, { roleId: 'frontend' }).missingSkills, []);

const runtimeOutput = {
  modelVersion: 'fixture',
  vectorDims: {}, vectors: {}, vectorSources: {}, sourceStats: {},
  rolePredictions: [
    { roleId: 'backend', roleName: 'Backend Developer', modelLabel: 'Backend', rank: 1, probability: 0.399616 },
    { roleId: 'frontend', roleName: 'Frontend Developer', modelLabel: 'Frontend', rank: 2, probability: 0.391 },
  ],
  skillGaps: {
    backend: { missingSkillNames: ['REST API', 'Database', 'Authentication'] },
    frontend: { missingSkillNames: ['React UI', 'Component Design', 'State Management', 'Frontend Testing', 'Responsive Design'] },
  },
};
const payload = buildDev2VecAnalysisPayload({
  repository: { _id: 'repo', githubRepoId: 1, name: 'fixture', fullName: 'fixture/frontend', language: 'TypeScript' },
  packageRecord: { packages: ['react', 'vite'], frameworks: ['React'], languages: ['TypeScript'] },
  commits: [{
    sha: 'a',
    files: [{ filename: 'src/pages/App.tsx' }],
    normalizedFiles: [
      {
        filename: 'src/pages/App.tsx',
        evidenceSource: 'commit_patch',
        detectedFrameworks: ['react'],
        detectedPatterns: ['frontend_component', 'frontend_style', 'frontend_responsive'],
        detectedRoleSignals: ['frontend'],
        skillSignals: ['React UI', 'Component Design', 'Responsive Design'],
        evidenceVersion: 'fixture',
      },
      {
        filename: 'src/components/AuthProvider.tsx',
        evidenceSource: 'commit_patch',
        detectedFrameworks: ['react'],
        detectedPatterns: ['frontend_component', 'frontend_state'],
        detectedRoleSignals: ['frontend'],
        skillSignals: ['React UI', 'Component Design', 'State Management'],
        evidenceVersion: 'fixture',
      },
      {
        filename: 'src/components/UserCard.tsx',
        evidenceSource: 'commit_patch',
        detectedFrameworks: ['react'],
        detectedPatterns: ['frontend_component'],
        detectedRoleSignals: ['frontend'],
        skillSignals: ['React UI', 'Component Design'],
        evidenceVersion: 'fixture',
      },
    ],
  }],
  contributionScope: { totalRepoCommits: 5 },
  githubAccount: { username: 'fixture-user' },
  dev2vecInput: {
    requestId: 'runtime-regression', apiTokens: ['react', 'vite'],
    sourceStats: {
      frontendFileCount: 20, backendFileCount: 0,
      userContributionFrontendFileCount: 14, userContributionBackendFileCount: 0,
      userContributionMobileFileCount: 0, userContributionDevopsFileCount: 0, userContributionDataFileCount: 3,
    },
    repoFeatureEvidence: { Frontend: { detected: true, evidence: [] } },
    evidencePreview: { docs: {}, repoFeatures: { Frontend: { detected: true, evidence: [] } } },
  },
  dev2vecOutput: runtimeOutput,
  issueEvidence: { issues: [], metadata: {} },
});
const response = sanitizeAnalysisSnapshot({ _id: 'analysis', ...payload }, { view: 'summary' });
assert.strictEqual(response.summary.projectType, 'Frontend');
assert.strictEqual(response.summary.careerDirection, 'Frontend Developer');
assert(response.topSkills.length > 0);
assert(response.topSkills.some((skill) => skill.skill === 'React UI'));
assert(response.topSkills.some((skill) => skill.skill === 'Component Design'));
assert(response.topSkills.some((skill) => skill.skill === 'State Management'));
assert(response.topSkills.some((skill) => skill.skill === 'Responsive Design'));
assert(response.missingSkills.every((skill) => skill.category === 'frontend'));
assert(!response.missingSkills.some((skill) => ['React UI', 'Component Design', 'State Management', 'Responsive Design'].includes(skill.skill)));
assert(response.missingSkills.some((skill) => skill.skill === 'Frontend Testing'));
assert(!response.missingSkills.some((skill) => ['REST API', 'Database', 'Authentication'].includes(skill.skill)));
assert(!response.topSkills.some((topSkill) => response.missingSkills.some((missingSkill) => missingSkill.skill === topSkill.skill)));
assert.strictEqual(Object.prototype.hasOwnProperty.call(response, 'normalizedFiles'), false);
assert.throws(
  () => sanitizeAnalysisSnapshot(null, { view: 'summary' }),
  (error) => error.message === 'Analysis result not available after analysis' && error.statusCode === 500
);
assert.throws(
  () => validateDev2VecOutput({ success: true, rolePredictions: [], vectorDims: {} }),
  (error) => error.message === 'Dev2Vec output is missing required fields' && error.errorCode === 'DEV2VEC_INVALID_OUTPUT'
);

const originalAxiosGet = axios.get;
const patchOnlyFiles = Array.from({ length: 80 }, (_, index) => ({
  filename: `src/components/PatchOnly${index}.tsx`,
  status: 'modified',
  additions: 2,
  changes: 2,
  patch: '+import React from "react";\n+export const PatchOnly = () => <main />;',
}));
axios.get = async () => {
  throw new Error('full file should not be fetched when patch evidence exists');
};
buildNormalizedCommitCodeEvidence({
  detail: { files: patchOnlyFiles },
  owner: 'fixture', repo: 'repo', accessToken: 'private', sha: 'patch-sha',
}).then((result) => {
  assert.strictEqual(result.metadata.eligibleFiles, 80);
  assert.strictEqual(result.metadata.selectedFiles, 80);
  assert.strictEqual(result.metadata.patchFilesParsed, 80);
  assert.strictEqual(result.metadata.fullFilesFetched, 0);
  assert.strictEqual(result.normalizedFiles.length, 80);
  axios.get = async (url, options) => {
    assert.strictEqual(options.params.ref, 'commit-sha');
    if (url.includes('Large.tsx')) {
      return { data: { encoding: 'base64', content: Buffer.alloc(120000, 'x').toString('base64') } };
    }
    return { data: { encoding: 'base64', content: Buffer.from('import React from "react"; export const App = () => <main />;').toString('base64') } };
  };
  return buildNormalizedCommitCodeEvidence({
    detail: {
      files: [
        ...Array.from({ length: 20 }, (_, index) => ({ filename: `src/components/NoPatch${index}.tsx`, status: 'modified', additions: 2 })),
        { filename: 'src/components/Large.tsx', status: 'modified', additions: 2 },
      ],
    },
    owner: 'fixture', repo: 'repo', accessToken: 'private', sha: 'commit-sha',
  });
}).then((result) => {
  assert.strictEqual(result.metadata.fullFilesFetched, 20);
  assert.strictEqual(result.metadata.pathOnlyFiles, 1);
  assert.strictEqual(result.metadata.skippedLargeFiles, 1);
  assert.strictEqual(result.normalizedFiles.length, 21);
  assert(result.normalizedFiles.some((file) => file.filename === 'src/components/Large.tsx' && file.evidenceSource === 'path_only'));
  assert(result.normalizedFiles.every((file) => Object.prototype.hasOwnProperty.call(file, 'content') === false));
  return buildNormalizedCommitCodeEvidence({
    detail: { files: [{ filename: 'src/App.tsx', status: 'modified', additions: 2 }] },
  owner: 'fixture', repo: 'repo', accessToken: 'private', sha: 'commit-sha',
  });
}).then((result) => {
  assert.strictEqual(result.metadata.fullFilesFetched, 1);
  assert.strictEqual(result.normalizedFiles[0].evidenceSource, 'file_at_commit');
  assert(result.normalizedFiles[0].detectedRoleSignals.includes('frontend'));
  assert.strictEqual(result.normalizedFiles[0].evidenceVersion, EVIDENCE_VERSION);
  assert.strictEqual(result.normalizedFiles[0].fileSelectionVersion, FILE_SELECTION_VERSION);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.normalizedFiles[0], 'content'), false);
  console.log('PASS: backend analysis pipeline fixes');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => { axios.get = originalAxiosGet; });
