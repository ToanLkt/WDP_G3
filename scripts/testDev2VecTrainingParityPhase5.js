const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildContributionSummary } = require('../src/services/github/github.contribution.service');
const { buildRepoDocument } = require('../src/services/dev2vec/repoDocumentBuilder.service');
const { buildAttributedIssueDocument } = require('../src/services/dev2vec/issueDocumentBuilder.service');
const { buildApiEvidence } = require('../src/services/dev2vec/apiEvidenceBuilder.service');

const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'test', 'fixtures', 'dev2vec-parity', 'core-parity.json');
const python = process.env.DEV2VEC_PYTHON_BIN || path.join(root, '.venv', 'Scripts', 'python.exe');
const exporter = path.join(root, 'ml_service', 'tests', 'export_extractor_fixture_result.py');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const runPython = (target = fixturePath) => JSON.parse(execFileSync(python, [exporter, target], { encoding: 'utf8', windowsHide: true }));

const pythonResult = runPython();
const summary = buildContributionSummary({ commits: fixture.commits, pullRequests: fixture.pullRequests, githubAccount: fixture.developerIdentity });
assert.deepStrictEqual({
  accepted: summary.accepted, verifiedChangedLines: summary.verifiedChangedLines,
  selectedCommitShas: summary.selectedCommitShas,
  selectedPullRequestNumbers: summary.selectedPullRequests.map((item) => item.number),
  changedPaths: summary.changedPaths,
}, pythonResult.contribution);

const repo = buildRepoDocument({ repository: fixture.repository, commits: fixture.commits, pullRequests: fixture.pullRequests, contributionSummary: summary });
for (const token of ['parity-service', 'feat: add parity route', 'add user api', 'pr body', 'src/route.js', 'src/pr.js', 'public setup']) {
  assert(repo.repoDocument.includes(token), `missing repo semantic token: ${token}`);
  assert(pythonResult.repoDocument.includes(token), `Python missing repo semantic token: ${token}`);
}
for (const forbidden of ['teammate secret', 'teammate pr', 'private.example', 'secret code']) {
  assert(!repo.repoDocument.includes(forbidden), `Node repo leaked: ${forbidden}`);
  assert(!pythonResult.repoDocument.includes(forbidden), `Python repo leaked: ${forbidden}`);
}
assert(repo.repoDocument.length <= 50000);
assert.strictEqual(buildRepoDocument({ repository: fixture.repository, commits: fixture.commits, contributionSummary: { accepted: false } }).repoDocument, '');

const nodeIssue = buildAttributedIssueDocument(fixture.issues);
assert.strictEqual(nodeIssue.issueDocument, pythonResult.issueDocument);
assert.deepStrictEqual(nodeIssue.selectedIssues.map((item) => item.number), pythonResult.selectedIssueNumbers);
assert(!nodeIssue.issueDocument.includes('teammate comment') && !nodeIssue.issueDocument.includes('ignored fourth') && !nodeIssue.issueDocument.includes('unrelated secret'));
const manyIssues = Array.from({ length: 35 }, (_, index) => ({ number: index + 1, repositoryFullName: 'acme/parity', relations: ['authored'], title: `Issue ${index}`, updatedAt: new Date(2026, 0, index + 1).toISOString(), userComments: [] }));
assert.strictEqual(buildAttributedIssueDocument(manyIssues).selectedIssues.length, 20);
assert(buildAttributedIssueDocument(manyIssues).issueDocument.length <= 30000);

const touched = fixture.touchedFiles.map((item) => ({ path: item.path, evidenceContent: item.content }));
const nodeApi = buildApiEvidence(touched).apiTokens;
assert.deepStrictEqual(nodeApi, pythonResult.apiTokens);
assert(!nodeApi.includes('secret-package'));
assert(nodeApi.includes('axios') && nodeApi.includes('sklearn.model_selection'));

const importCases = [
  ['java', '.java', 'import org.springframework.web.bind.annotation.RestController;'],
  ['kotlin', '.kt', 'import io.ktor.server.application.Application'],
  ['scala', '.scala', 'import akka.actor.typed.ActorSystem'],
  ['dart', '.dart', "import 'package:flutter/material.dart';"],
  ['csharp', '.cs', 'using Microsoft.AspNetCore.Mvc;'],
  ['rust', '.rs', 'use serde::Serialize;'],
  ['ruby', '.rb', "require 'sinatra/base'"],
  ['go', '.go', 'import "github.com/gin-gonic/gin"'],
];
const extended = JSON.parse(JSON.stringify(fixture));
for (const [name, ext, content] of importCases) {
  for (let index = 0; index < 5; index += 1) extended.touchedFiles.push({ path: `languages/${name}-${index}${ext}`, content });
}
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev2vec-parity-'));
const extendedPath = path.join(tempDir, 'extended.json');
try {
  fs.writeFileSync(extendedPath, JSON.stringify(extended), 'utf8');
  const pythonExtended = runPython(extendedPath);
  const nodeExtended = buildApiEvidence(extended.touchedFiles.map((item) => ({ path: item.path, evidenceContent: item.content }))).apiTokens;
  assert.deepStrictEqual(nodeExtended, pythonExtended.apiTokens);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const imports = (count, token) => Array.from({ length: count }, (_, index) => ({ path: `${token}-${index}.js`, evidenceContent: `import x from '${token}'` }));
assert(!buildApiEvidence(imports(4, 'four')).apiTokens.includes('four'));
assert(buildApiEvidence(imports(5, 'five')).apiTokens.includes('five'));
assert(buildApiEvidence(imports(6, 'six')).apiTokens.includes('six'));
assert.deepStrictEqual(buildApiEvidence([...imports(2, 'aggregate'), ...imports(3, 'aggregate').map((item, index) => ({ ...item, path: `other-${index}.js` }))]).apiTokens, ['aggregate']);

const gateCases = [
  { commits: [{ ...fixture.commits[0], additions: 3, deletions: 1 }], expected: false },
  { commits: [{ ...fixture.commits[0], additions: 3, deletions: 2 }], expected: true },
  { commits: [{ ...fixture.commits[0], additions: undefined, deletions: undefined }], expected: false },
  { commits: [], pullRequests: [{ ...fixture.pullRequests[0], additions: 5, deletions: 0 }], expected: true },
];
gateCases.forEach((item) => assert.strictEqual(buildContributionSummary({ ...item, githubAccount: fixture.developerIdentity }).accepted, item.expected));
assert(buildContributionSummary({ commits: [{ ...fixture.commits[0], authorLogin: '', authorGithubId: 42 }], githubAccount: fixture.developerIdentity }).accepted);
assert(buildContributionSummary({ commits: [{ ...fixture.commits[0], authorLogin: '', authorEmail: 'student@example.com' }], githubAccount: fixture.developerIdentity }).accepted);
assert(buildContributionSummary({ commits: [{ ...fixture.commits[0], authorLogin: '', authorName: 'student-dev' }], githubAccount: fixture.developerIdentity }).accepted);

console.log('PASS: Phase 5 Node/Python training parity (shared fixture + matrix variants)');
