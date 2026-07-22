const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const checks = [
  {
    file: 'src/models/ChatSession.js',
    patterns: [
      'repositoryId',
      "ref: 'Repository'",
      'roadmapId',
      "ref: 'Roadmap'",
      'analysisId',
      "ref: 'AnalysisResult'",
      'snapshotId',
      "ref: 'RepoAnalysisSnapshot'",
      'contextPinnedAt',
      'contextPinnedBy',
    ],
  },
  {
    file: 'src/validators/chat.validator.js',
    patterns: [
      "require('mongoose')",
      "['repositoryId', 'roadmapId', 'analysisId', 'snapshotId']",
      'must be a valid ObjectId',
    ],
  },
  {
    file: 'src/services/currentContext.service.js',
    patterns: [
      'body_roadmap',
      'body_repository',
      'body_analysis',
      'session_roadmap',
      'session_repository',
      'session_analysis',
      'latest_user_analysis',
      'no_compatible_dev2vec_analysis',
      'compatible_snapshot_missing',
      'contextSelectionReason',
      'repoName',
    ],
  },
  {
    file: 'src/services/chat.service.js',
    patterns: [
      'getContextSelectors',
      'buildSessionContextUpdate',
      'pinSessionContext',
      'resolveCurrentContext(userId, { bodySelectors })',
      'resolveCurrentContext(userId, { bodySelectors, sessionSelectors })',
      'selectedIsExplicit && !needsComparisonContext ? [] : githubContext.repositories',
      'selectedIsExplicit && !needsComparisonContext ? [] : githubContext.analysisSnapshots',
      'buildRepoComparisonContext',
      'contextPinned',
    ],
  },
  {
    file: 'src/services/ai/chatContext.prompt.js',
    patterns: [
      'selectedContextIsExplicit',
      'Use Selected Current Context as the source of truth',
      'do not override it with secondary repositories',
    ],
  },
  {
    file: 'src/routes/chat.routes.js',
    patterns: [
      'Optional repository context to pin to this chat session',
      'contextSelectionReason',
      'contextPinned',
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = read(check.file);
  for (const pattern of check.patterns) {
    if (!content.includes(pattern)) {
      failures.push(`${check.file} missing ${pattern}`);
    }
  }
}

if (read('src/services/currentContext.service.js').includes("models/AnalysisSnapshot")) {
  failures.push('src/services/currentContext.service.js must not silently fall back to legacy AnalysisSnapshot');
}

if (failures.length) {
  console.error('Chat context pinning checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Chat context pinning checks passed.');
