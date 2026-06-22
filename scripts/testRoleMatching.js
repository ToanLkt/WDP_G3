const { ROLE_SKILL_VECTORS } = require('../src/constants/roleSkillVectors');
const { isKnownSkill } = require('../src/utils/skillCanonicalizer');
const { matchSkillVectorToRoles } = require('../src/services/roleMatching.service');

const skillVector = [
  { skill: 'Express.js', canonicalSkillName: 'Express.js', category: 'Backend', score: 0.9772, level: 'strong' },
  { skill: 'REST API', canonicalSkillName: 'REST API', category: 'Backend', score: 0.8583, level: 'strong' },
  { skill: 'JWT Authentication', canonicalSkillName: 'JWT Authentication', category: 'Backend', score: 0.9829, level: 'strong' },
  { skill: 'Authentication', canonicalSkillName: 'Authentication', category: 'Backend', score: 0.8113, level: 'strong' },
  { skill: 'MongoDB', canonicalSkillName: 'MongoDB', category: 'Database', score: 0.7425, level: 'strong' },
  { skill: 'Mongoose', canonicalSkillName: 'Mongoose', category: 'Database', score: 0.9884, level: 'strong' },
  { skill: 'Docker', canonicalSkillName: 'Docker', category: 'DevOps', score: 0.961, level: 'strong' },
  { skill: 'Docker Compose', canonicalSkillName: 'Docker Compose', category: 'DevOps', score: 0.9543, level: 'strong' },
  { skill: 'Swagger', canonicalSkillName: 'Swagger', category: 'Backend', score: 0.909, level: 'strong' },
  { skill: 'Environment Variables', canonicalSkillName: 'Environment Variables', category: 'Backend', score: 0.9188, level: 'strong' },
  { skill: 'JavaScript', canonicalSkillName: 'JavaScript', category: 'Frontend', score: 0.56, level: 'developing' },
  { skill: 'Node.js', canonicalSkillName: 'Node.js', category: 'Backend', score: 0.495, level: 'developing' },
  { skill: 'Testing', canonicalSkillName: 'Testing', category: 'Testing', score: 0, level: 'missing' },
  { skill: 'CI/CD', canonicalSkillName: 'CI/CD', category: 'DevOps', score: 0, level: 'missing' },
  { skill: 'Clean Code', canonicalSkillName: 'Clean Code', category: 'Code Quality', score: 0, level: 'missing' },
];

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);

try {
  for (const role of ROLE_SKILL_VECTORS) {
    for (const requirement of [...role.requiredSkills, ...role.optionalSkills]) {
      if (!isKnownSkill(requirement.canonicalSkillName)) {
        fail(`${role.roleName} uses unknown skill ${requirement.canonicalSkillName}`);
      }
    }
  }
  pass('all role requirements use canonical skills');

  const matches = matchSkillVectorToRoles(skillVector, { limit: 6, includeDetails: true });
  if (matches.some((item, index) => index && matches[index - 1].matchScore < item.matchScore)) {
    fail('matches are not sorted descending');
  }
  if (matches.some((item) => item.matchScore < 0 || item.matchScore > 100)) {
    fail('match score is outside 0-100');
  }

  const backend = matches.find((item) => item.roleId === 'backend-developer');
  const frontend = matches.find((item) => item.roleId === 'frontend-developer');
  const devops = matches.find((item) => item.roleId === 'devops-engineer');
  if (!backend || !frontend || backend.matchScore <= frontend.matchScore) {
    fail('Backend Developer should score higher than Frontend Developer');
  }
  const backendMatched = new Set(backend.matchedSkills.map((item) => item.canonicalSkillName));
  for (const name of ['Express.js', 'REST API', 'MongoDB', 'Mongoose', 'JWT Authentication']) {
    if (!backendMatched.has(name)) fail(`Backend matched skills missing ${name}`);
  }
  const backendGaps = new Set([
    ...backend.weakSkills,
    ...backend.missingRequiredSkills,
  ].map((item) => item.canonicalSkillName));
  for (const name of ['Testing', 'Clean Code', 'API Testing']) {
    if (!backendGaps.has(name)) fail(`Backend gaps missing ${name}`);
  }
  if (!backend.recommendedNextSkills.includes('Testing') || !backend.recommendedNextSkills.includes('Clean Code')) {
    fail('Backend recommendations lack priority skills');
  }
  if (!devops || !devops.matchedSkills.some((item) => item.canonicalSkillName === 'Docker')) {
    fail('DevOps match should recognize Docker');
  }
  if (!devops.missingRequiredSkills.some((item) => item.canonicalSkillName === 'CI/CD')) {
    fail('DevOps gaps should include CI/CD');
  }
  pass('WDP_G3-like vector produces expected role matches');

  const compact = matchSkillVectorToRoles(skillVector, { limit: 1 })[0];
  if ('matchedSkills' in compact || !compact.topMatchedSkills || !compact.recommendedNextSkills) {
    fail('Compact role response is incorrect');
  }
  pass('compact response omits full detail arrays');

  console.log('All role matching tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
