const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const checks = [
  {
    file: 'src/models/Roadmap.js',
    patterns: ['isDeleted', 'deletedAt', 'deletedBy'],
  },
  {
    file: 'src/models/ChatSession.js',
    patterns: ['userDeletedAt', 'closedAt', 'closedBy', 'closeReason'],
  },
  {
    file: 'src/services/roadmap.service.js',
    patterns: [
      'const deleteRoadmap',
      'isDeleted: { $ne: true }',
      'Roadmap deleted successfully',
      'deleted: true',
    ],
  },
  {
    file: 'src/services/roadmapLearning.service.js',
    patterns: ['isDeleted: { $ne: true }'],
  },
  {
    file: 'src/services/roadmapProgress.service.js',
    patterns: ['isDeleted: { $ne: true }'],
  },
  {
    file: 'src/services/chat.service.js',
    patterns: [
      'const deleteSession',
      'userDeletedAt: null',
      'Chat session deleted successfully',
      'const closeAdminChatSession',
      'Chat session closed successfully',
      'CHAT_SESSION_CLOSED',
      'ensureSessionOpen(session)',
    ],
  },
  {
    file: 'src/routes/roadmap.routes.js',
    patterns: ["router.delete('/:roadmapId'", '/api/roadmaps/{roadmapId}:', 'summary: Delete a roadmap'],
  },
  {
    file: 'src/routes/chat.routes.js',
    patterns: ["router.delete('/sessions/:sessionId'", 'summary: Delete current user'],
  },
  {
    file: 'src/routes/admin.routes.js',
    patterns: ['router.patch("/chat/sessions/:sessionId/close"', 'summary: Close a chat session as admin'],
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

if (failures.length) {
  console.error('Soft delete / close policy checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Soft delete / close policy checks passed.');
