const {
  buildLearningContentKey,
} = require('../src/services/learning.service');
const {
  canonicalizeSkillName,
} = require('../src/utils/skillCanonicalizer');

const cases = [
  ['Code Quality', 'Clean Code'],
  ['CICD', 'CI/CD'],
  ['CI CD', 'CI/CD'],
  ['JWT Auth', 'JWT Authentication'],
  ['docker-compose', 'Docker Compose'],
  ['MongoDB/Mongoose', 'Mongoose'],
  ['OpenAPI', 'Swagger'],
  ['Environment Configuration', 'Environment Variables'],
  ['Testing', 'Testing'],
  ['Clean Code', 'Clean Code'],
];

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);

try {
  const outputs = [];
  for (const [input, expected] of cases) {
    const actual = canonicalizeSkillName(input);
    if (actual !== expected) fail(`${input}: expected ${expected}, got ${actual}`);
    outputs.push(actual);
  }
  pass('all learning skill aliases canonicalize correctly');

  const key = buildLearningContentKey({
    skillName: 'Code Quality',
    targetRole: 'Backend Developer',
    level: 'beginner',
    language: 'vi',
  });
  const expectedKey = {
    skillName: 'Clean Code',
    canonicalSkillName: 'Clean Code',
    normalizedSkillName: 'clean code',
    normalizedTargetRole: 'backend developer',
    level: 'beginner',
    language: 'vi',
  };
  for (const [field, expected] of Object.entries(expectedKey)) {
    if (key[field] !== expected) fail(`${field}: expected ${expected}, got ${key[field]}`);
  }
  if (key.requestedSkillName !== 'Code Quality') fail('requestedSkillName was not preserved');
  pass('learning content key uses canonical identity');

  const canonicalKeys = cases.map(([input]) =>
    buildLearningContentKey({
      skillName: input,
      targetRole: 'Backend Developer',
      level: 'beginner',
      language: 'vi',
    }).normalizedSkillName
  );
  if (canonicalKeys[0] !== 'clean code' || canonicalKeys[1] !== canonicalKeys[2]) {
    fail('aliases do not converge to the same canonical key');
  }
  pass('aliases converge to canonical cache keys');

  console.log('All learning canonicalization tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
