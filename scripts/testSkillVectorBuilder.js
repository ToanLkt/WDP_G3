const {
  buildSkillVectorFromAnalysis,
  getSkillLevel,
} = require('../src/services/skillVector.service');

const input = {
  languages: ['JavaScript'],
  frameworks: ['Express.js', 'MongoDB/Mongoose'],
  packages: ['express', 'mongoose', 'jsonwebtoken', 'dotenv'],
  configs: ['Dockerfile', 'docker-compose.yml', '.env.example'],
  skillSignals: ['REST API', 'JWT Auth'],
  careerSignals: ['Backend Developer'],
  checklist: {
    hasReadme: true,
    hasEnvExample: true,
    hasDocker: true,
    hasDockerCompose: true,
    hasCICD: false,
    hasTesting: false,
    hasLinting: false,
    hasFormatter: false,
    hasPackageFile: true,
  },
  scores: {
    techStackScore: 100,
    testingScore: 0,
    deploymentScore: 70,
  },
  missingSkills: ['Testing', 'CI/CD', 'Code Quality'],
  projectType: 'Backend API',
  careerDirection: 'Backend Developer',
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const pass = (message) => console.log(`PASS: ${message}`);

try {
  const { skillEvidence, skillVector } = buildSkillVectorFromAnalysis(input);
  const byName = new Map(skillVector.map((item) => [item.canonicalSkillName, item]));
  const requiredSkills = [
    'JavaScript',
    'Express.js',
    'Mongoose',
    'JWT Authentication',
    'REST API',
    'Docker',
    'Docker Compose',
    'Environment Variables',
  ];

  for (const skill of requiredSkills) {
    if (!byName.has(skill)) fail(`skillVector is missing ${skill}`);
    pass(`skillVector contains ${skill}`);
  }

  if (byName.get('Express.js').level !== 'strong') fail('Express.js should be strong');
  pass('Express.js level is strong');

  for (const skill of ['Testing', 'CI/CD', 'Clean Code']) {
    const item = byName.get(skill);
    if (!item || item.score !== 0 || item.level !== 'missing') {
      fail(`${skill} should have score 0 and level missing`);
    }
    pass(`${skill} is represented as missing`);
  }

  if (new Set(skillVector.map((item) => item.canonicalSkillName)).size !== skillVector.length) {
    fail('skillVector contains duplicate canonicalSkillName values');
  }
  pass('skillVector has no duplicate canonicalSkillName values');

  if (!skillEvidence.length) fail('skillEvidence should not be empty');
  if (getSkillLevel(0) !== 'missing' || getSkillLevel(0.2) !== 'weak' || getSkillLevel(0.5) !== 'developing' || getSkillLevel(0.7) !== 'strong') {
    fail('getSkillLevel boundaries are incorrect');
  }
  pass('skill level boundaries are correct');

  console.log('All skill vector builder tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
