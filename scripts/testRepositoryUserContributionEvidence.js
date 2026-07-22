const assert = require('assert');

const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');
const {
  isCommitDetailCacheFresh,
  normalizeCommitDetail,
} = require('../src/services/github/github.commit.service');

const baseRepository = {
  name: 'Plantcare_admin_Web',
  fullName: 'ToanLkt/Plantcare_admin_Web',
  defaultBranch: 'master',
  language: 'TypeScript',
};

const packageRecord = {
  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    'react-router-dom': '^6.0.0',
    axios: '^1.0.0',
  },
  devDependencies: {
    vite: '^5.0.0',
    tailwindcss: '^3.0.0',
    vitest: '^1.0.0',
  },
  frameworks: ['React', 'React Router', 'Vite', 'Tailwind CSS', 'Vitest'],
  detectedFiles: [
    {
      path: 'src/pages/UsersPage.tsx',
      sourceContent: 'import React from "react"; import axios from "axios"; export function UsersPage(){ return <div className="p-4">Users</div>; }',
    },
    {
      path: 'src/routes/ProtectedRoute.tsx',
      sourceContent: 'import { Navigate, Outlet } from "react-router-dom"; export function ProtectedRoute(){ return <Outlet />; }',
    },
    {
      path: 'src/styles/index.css',
      sourceContent: '@tailwind base; @tailwind components; @tailwind utilities;',
    },
    {
      path: 'vite.config.ts',
      sourceContent: 'import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()] });',
    },
  ],
};

const buildInput = ({ commits, packages = [packageRecord], repository = baseRepository }) => buildDev2VecInputFromRepositoryAnalysis({
  repository,
  packages,
  commits,
  contributionSummary: { accepted: true, selectedCommitShas: commits.map((commit) => commit.sha), selectedPullRequests: [] },
  issues: [],
  topN: 3,
  requestId: `test-${Date.now()}`,
});

const frontendCommit = {
  sha: 'front1',
  message: 'initial frontend app',
  files: [
    { filename: 'src/pages/UsersPage.tsx', status: 'added', additions: 100, deletions: 0, changes: 100 },
    { filename: 'src/routes/ProtectedRoute.tsx', status: 'added', additions: 40, deletions: 0, changes: 40 },
    { filename: 'src/styles/index.css', status: 'added', additions: 20, deletions: 0, changes: 20 },
    { filename: 'vite.config.ts', status: 'added', additions: 12, deletions: 0, changes: 12 },
  ],
};

const frontendInput = buildInput({ commits: [frontendCommit] });
assert(frontendInput.repoFeatureEvidence.Frontend.detected, 'frontend repo context should be detected');
assert(!frontendInput.repoFeatureEvidence['REST API'].detected, 'React Router must not be treated as backend REST API');
assert(frontendInput.sourceStats.userContributionFrontendFileCount >= 3, 'frontend changed files should be user contribution evidence');
assert.strictEqual(frontendInput.sourceStats.userContributionBackendFileCount, 0, 'frontend changed files should not become backend evidence');
assert(frontendInput.repoDocument.includes('user changed paths'), 'repoDocument should include user contribution section');
assert(frontendInput.repoDocument.includes('src/routes/protectedroute.tsx'), 'repoDocument should include ProtectedRoute changed file');

const backendInput = buildInput({
  packages: [{
    dependencies: { express: '^4.0.0', mongoose: '^8.0.0' },
    detectedFiles: [
      { path: 'src/routes/user.routes.js', sourceContent: 'const router = require("express").Router(); router.get("/users", controller.list);' },
      { path: 'src/controllers/user.controller.js', sourceContent: 'exports.list = (req, res) => res.json([]);' },
      { path: 'src/models/User.js', sourceContent: 'const mongoose = require("mongoose"); module.exports = mongoose.model("User", new mongoose.Schema({}));' },
    ],
  }],
  commits: [{
    sha: 'back1',
    message: 'add backend routes',
    files: [
      { filename: 'src/routes/user.routes.js', status: 'added', additions: 30 },
      { filename: 'src/controllers/user.controller.js', status: 'added', additions: 40 },
      { filename: 'src/models/User.js', status: 'added', additions: 15 },
    ],
  }],
});
assert(backendInput.repoFeatureEvidence.Backend.detected, 'backend repo context should be detected');
assert(backendInput.sourceStats.userContributionBackendFileCount >= 2, 'backend changed files should be backend contribution evidence');

const readmeInput = buildInput({
  commits: [{ sha: 'doc1', message: 'update docs', files: [{ filename: 'README.md', status: 'modified', additions: 5 }] }],
});
assert.strictEqual(readmeInput.sourceStats.userContributionFrontendFileCount, 0, 'README-only commit should not add frontend user skill');
assert.strictEqual(readmeInput.sourceStats.userContributionBackendFileCount, 0, 'README-only commit should not add backend user skill');
assert(readmeInput.repoFeatureEvidence.Frontend.detected, 'README-only user work should preserve project type from whole repo context');

const detailFailInput = buildInput({
  commits: [{ sha: 'fail1', message: 'metadata only commit', detailStatus: 'fetch_failed', files: [] }],
});
assert(detailFailInput.repoFeatureEvidence.Frontend.detected, 'detail fetch failure should still analyze whole repo context');
assert.strictEqual(detailFailInput.sourceStats.userContributionFileCount, 0, 'detail fetch failure should not invent changed-file skill evidence');

const axiosInput = buildInput({
  packages: [packageRecord],
  commits: [{
    sha: 'api1',
    message: 'add client api',
    files: [{ filename: 'src/pages/UsersPage.tsx', status: 'modified', additions: 15 }],
  }],
});
assert(axiosInput.sourceStats.categoryCounts.frontend_api_client >= 1 || axiosInput.repoDocument.includes('frontend_api_client'), 'axios client should be frontend_api_client evidence');
assert(!axiosInput.repoFeatureEvidence['REST API'].detected, 'axios client should not create backend REST server evidence');

const normalizedDetail = normalizeCommitDetail({
  detail: {
    stats: { additions: 12, deletions: 3 },
    files: Array.from({ length: 60 }, (_, index) => ({
      filename: `src/pages/Page${index}.tsx`,
      status: 'added',
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: '+'.repeat(500),
    })),
  },
  maxFiles: 40,
  patchMaxChars: 0,
});
assert.strictEqual(normalizedDetail.additions, 12, 'commit detail should keep additions from GitHub stats');
assert.strictEqual(normalizedDetail.deletions, 3, 'commit detail should keep deletions from GitHub stats');
assert.strictEqual(normalizedDetail.changedFiles, 60, 'changedFiles should reflect GitHub detail file count');
assert.strictEqual(normalizedDetail.files.length, 40, 'large commit file detail should be quota-limited');
assert(!Object.prototype.hasOwnProperty.call(normalizedDetail.files[0], 'patch'), 'full patch should not be stored by default');

assert.strictEqual(isCommitDetailCacheFresh({
  detailStatus: 'success',
  detailFetchedAt: new Date(),
}), true, 'fresh commit detail cache should be reused');
assert.strictEqual(isCommitDetailCacheFresh({
  detailStatus: '',
  detailFetchedAt: null,
}), false, 'legacy empty commit cache should be refetched');

const contractInput = buildInput({ commits: [frontendCommit] });
assert.strictEqual(typeof contractInput.sourceStats.commitCount, 'number');
assert.strictEqual(typeof contractInput.sourceStats.changedFileCount, 'number');

console.log('PASS repository user contribution evidence regression');
console.log(JSON.stringify({
  frontend: {
    repoFrontendDetected: frontendInput.repoFeatureEvidence.Frontend.detected,
    restApiDetected: frontendInput.repoFeatureEvidence['REST API'].detected,
    userContributionFrontendFileCount: frontendInput.sourceStats.userContributionFrontendFileCount,
    userContributionBackendFileCount: frontendInput.sourceStats.userContributionBackendFileCount,
  },
  backend: {
    repoBackendDetected: backendInput.repoFeatureEvidence.Backend.detected,
    userContributionBackendFileCount: backendInput.sourceStats.userContributionBackendFileCount,
  },
  readmeOnly: {
    userContributionFrontendFileCount: readmeInput.sourceStats.userContributionFrontendFileCount,
    userContributionBackendFileCount: readmeInput.sourceStats.userContributionBackendFileCount,
    repoFrontendDetected: readmeInput.repoFeatureEvidence.Frontend.detected,
  },
  detailFetchFail: {
    repoFrontendDetected: detailFailInput.repoFeatureEvidence.Frontend.detected,
    userContributionFileCount: detailFailInput.sourceStats.userContributionFileCount,
  },
  detail: {
    additions: normalizedDetail.additions,
    deletions: normalizedDetail.deletions,
    changedFiles: normalizedDetail.changedFiles,
    storedFiles: normalizedDetail.files.length,
    storesPatch: Object.prototype.hasOwnProperty.call(normalizedDetail.files[0], 'patch'),
  },
}, null, 2));
