const assert = require('assert');

const {
  buildAnalysisSkillsFromDev2Vec,
  buildAnalysisSummaryFromDev2Vec,
  getDev2VecMatchLevel,
  mapDev2VecOutputToRoleMatches,
} = require('../src/services/dev2vec/dev2vecRoleMapper.service');

const dev2vecOutput = {
  success: true,
  modelVersion: 'dev2vec-demo-v1',
  vectorDims: {
    repo: 230,
    issue: 150,
    api: 200,
    combined: 580,
  },
  rolePredictions: [
    {
      roleId: 'backend',
      roleName: 'Backend Developer',
      modelLabel: 'Backend',
      probability: 0.72314,
      rank: 1,
    },
    {
      roleId: 'frontend',
      roleName: 'Frontend Developer',
      modelLabel: 'Frontend',
      probability: 0.25,
      rank: 2,
    },
  ],
  skillGaps: {
    backend: {
      matchedSkillNames: ['REST API'],
      weakSkillNames: ['Database'],
      missingSkillNames: ['Authentication'],
      recommendedNextSkills: ['Authentication', 'Database'],
      details: [
        {
          skillName: 'REST API',
          canonicalSkillName: 'REST API',
          similarity: 0.612345,
          status: 'matched',
        },
        {
          skillName: 'Database',
          canonicalSkillName: 'Database',
          similarity: 0.412345,
          status: 'weak',
        },
        {
          skillName: 'Authentication',
          canonicalSkillName: 'Authentication',
          similarity: 0.212345,
          status: 'missing',
        },
      ],
    },
  },
  vectorSources: {
    repos: true,
    issues: true,
    apis: true,
  },
  sourceStats: {
    repoTextLength: 62,
    issueTextLength: 54,
    apiTokenCount: 4,
  },
};

const mapped = mapDev2VecOutputToRoleMatches(dev2vecOutput, { includeDetails: true });
const [backend, frontend] = mapped.matches;

assert.strictEqual(backend.matchScore, 72.31);
assert.strictEqual(getDev2VecMatchLevel(72.31), 'strong');
assert.strictEqual(backend.matchLevel, 'strong');
assert.strictEqual(backend.matchLevelLabel, 'Phù hợp cao');
assert.deepStrictEqual(backend.matchedSkillNames, ['REST API']);
assert.deepStrictEqual(backend.weakSkillNames, ['Database']);
assert.deepStrictEqual(backend.missingSkillNames, ['Authentication']);
assert.deepStrictEqual(backend.recommendedNextSkills, ['Authentication', 'Database']);
assert.strictEqual(backend.matchedSkills.length, 1);
assert.strictEqual(backend.weakSkills.length, 1);
assert.strictEqual(backend.missingRequiredSkills.length, 1);
assert.strictEqual(backend.missingOptionalSkills.length, 0);
assert.strictEqual(backend.matchedSkills[0].score, 61.23);
assert.strictEqual(backend.matchedSkills[0].similarity, 0.612345);
assert.strictEqual(backend.scoringMethod, 'dev2vec_doc2vec_classifier');

assert.deepStrictEqual(frontend.matchedSkillNames, []);
assert.deepStrictEqual(frontend.weakSkillNames, []);
assert.deepStrictEqual(frontend.missingSkillNames, []);
assert.deepStrictEqual(frontend.recommendedNextSkills, []);

const summary = buildAnalysisSummaryFromDev2Vec(dev2vecOutput);
assert.strictEqual(summary.careerDirection, 'Backend Developer');
assert.strictEqual(summary.projectType, 'Backend');
assert.strictEqual(summary.overallScore, 72.31);
assert.strictEqual(summary.userReadinessScore, 72.31);
assert.strictEqual(summary.userLevel, 'intermediate');
assert.strictEqual(summary.confidence, 0.72314);

const phase6Output = {
  ...dev2vecOutput,
  rolePredictions: [
    { roleId: 'backend', roleName: 'Backend Developer', modelLabel: 'Backend', probability: 0.781326, rank: 1 },
    { roleId: 'devops', roleName: 'DevOps Engineer', modelLabel: 'DevOps', probability: 0.071985, rank: 2 },
    { roleId: 'data_scientist', roleName: 'Data Scientist', modelLabel: 'Data Scientist', probability: 0.067734, rank: 3 },
    { roleId: 'frontend', roleName: 'Frontend Developer', modelLabel: 'Frontend', probability: 0.05, rank: 4 },
  ],
  skillGaps: {
    backend: dev2vecOutput.skillGaps.backend,
    devops: {},
    data_scientist: {},
    frontend: {},
  },
};
const phase6Matches = mapDev2VecOutputToRoleMatches(phase6Output, { limit: 5 }).matches;
assert.deepStrictEqual(phase6Matches.map((match) => match.roleId), ['backend', 'devops', 'data_scientist']);
assert.deepStrictEqual(phase6Matches.map((match) => match.matchScore), [78.13, 7.2, 6.77]);

const rawScoreOutput = {
  ...dev2vecOutput,
  rolePredictions: [
    { roleId: 'backend', roleName: 'Backend Developer', modelLabel: 'Backend', probability: 0.9, rank: 1 },
  ],
  skillGaps: {
    backend: {
      matchedSkillNames: ['Database', 'Authentication', 'Docker Basics'],
      weakSkillNames: ['API Testing'],
      missingSkillNames: ['REST API'],
      details: [
        { skillName: 'REST API', canonicalSkillName: 'REST API', similarity: 0, status: 'missing' },
        { skillName: 'Database', canonicalSkillName: 'Database', similarity: 0.001, status: 'matched' },
        { skillName: 'Authentication', canonicalSkillName: 'Authentication', similarity: 0.318654, status: 'matched' },
        { skillName: 'Docker Basics', canonicalSkillName: 'Docker Basics', similarity: 0.85, status: 'matched' },
        { skillName: 'API Testing', canonicalSkillName: 'API Testing', similarity: null, status: 'weak' },
      ],
    },
  },
};

const skillMapping = buildAnalysisSkillsFromDev2Vec(rawScoreOutput);
const byName = (items) => Object.fromEntries(items.map((item) => [item.canonicalSkillName, item]));
const topByName = byName(skillMapping.topSkills);
const missingByName = byName(skillMapping.missingSkills);

assert.strictEqual(missingByName['REST API'].score, 0);
assert.strictEqual(topByName.Database.score, 0.1);
assert.strictEqual(topByName.Authentication.score, 31.87);
assert.strictEqual(topByName['Docker Basics'].score, 85);
assert.strictEqual(missingByName['API Testing'].score, 0);
assert(!missingByName.Database);
assert(!missingByName.Authentication);
assert(!missingByName['Docker Basics']);

const duplicatedSkills = skillMapping.topSkills
  .map((item) => item.canonicalSkillName)
  .filter((skillName) => Object.prototype.hasOwnProperty.call(missingByName, skillName));
assert.deepStrictEqual(duplicatedSkills, []);

console.log('PASS: Dev2Vec role mapper smoke test');
