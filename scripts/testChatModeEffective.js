const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'src/services/chat.service.js');
const serviceContent = fs.readFileSync(servicePath, 'utf8');
const { computeChatSessionMode } = require(servicePath);

const cases = [
  {
    name: 'global AI_AUTO controls GLOBAL session',
    session: { modeSource: 'GLOBAL', mode: 'MANUAL' },
    setting: { mode: 'AI_AUTO' },
    expected: { mode: null, modeSource: 'GLOBAL', effectiveMode: 'AI_AUTO' },
  },
  {
    name: 'global MANUAL controls GLOBAL session',
    session: { modeSource: 'GLOBAL', mode: 'AI_AUTO' },
    setting: { mode: 'MANUAL' },
    expected: { mode: null, modeSource: 'GLOBAL', effectiveMode: 'MANUAL' },
  },
  {
    name: 'SESSION MANUAL is not overridden by global AI_AUTO',
    session: { modeSource: 'SESSION', mode: 'MANUAL' },
    setting: { mode: 'AI_AUTO' },
    expected: { mode: 'MANUAL', modeSource: 'SESSION', effectiveMode: 'MANUAL' },
  },
  {
    name: 'missing legacy fields follow global mode',
    session: {},
    setting: { mode: 'MANUAL' },
    expected: { mode: null, modeSource: 'GLOBAL', effectiveMode: 'MANUAL' },
  },
  {
    name: 'SESSION missing mode falls back to global mode',
    session: { modeSource: 'SESSION' },
    setting: { mode: 'AI_AUTO' },
    expected: { mode: null, modeSource: 'SESSION', effectiveMode: 'AI_AUTO' },
  },
];

for (const item of cases) {
  assert.deepStrictEqual(computeChatSessionMode(item.session, item.setting), item.expected, item.name);
}

const requiredPatterns = [
  'const computeChatSessionMode',
  'sessions.map((session) => buildSessionResponse(session, setting))',
  'session: buildSessionResponse(session, setting)',
  '...buildSessionWithEffectiveMode(session, setting)',
  'const modeState = computeChatSessionMode(session, setting)',
  "if (effectiveMode === 'MANUAL')",
  "modeSource: 'GLOBAL'",
  'mode: null',
  'normalizeActiveStatusForMode(existingSession.status ||',
  "await ChatSession.updateMany(\n      { modeSource: 'GLOBAL', status: 'waiting_admin', closedAt: null }",
  "error.errorCode = 'CHAT_SESSION_CLOSED'",
];

const failures = requiredPatterns.filter((pattern) => !serviceContent.includes(pattern));
if (failures.length) {
  console.error('Chat effective mode static checks failed:');
  for (const failure of failures) console.error(`- missing ${failure}`);
  process.exit(1);
}

console.log('Chat effective mode checks passed.');
