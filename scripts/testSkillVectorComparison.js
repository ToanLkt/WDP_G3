const { compareSkillVectors } = require('../src/services/skillVectorCompare.service');
const { buildComparisonResult } = require('../src/services/snapshot.service');

const fromSkillVector = [
  { skill: 'Testing', canonicalSkillName: 'Testing', category: 'Testing', score: 0, level: 'missing', evidence: ['Detected as missing skill in analysis'], sources: ['missing_signal'] },
  { skill: 'Docker', canonicalSkillName: 'Docker', category: 'DevOps', score: 0.7, level: 'strong', evidence: ['Detected config: Docker'], sources: ['config'] },
  { skill: 'CI/CD', canonicalSkillName: 'CI/CD', category: 'DevOps', score: 0, level: 'missing', evidence: ['Detected as missing skill in analysis'], sources: ['missing_signal'] },
];

const toSkillVector = [
  { skill: 'Testing', canonicalSkillName: 'Testing', category: 'Testing', score: 0.45, level: 'developing', evidence: ['Detected package: jest'], sources: ['package'] },
  { skill: 'Docker', canonicalSkillName: 'Docker', category: 'DevOps', score: 0.85, level: 'strong', evidence: ['Detected config: Docker', 'Analysis checklist confirmed Docker'], sources: ['config', 'checklist'] },
  { skill: 'CI/CD', canonicalSkillName: 'CI/CD', category: 'DevOps', score: 0, level: 'missing', evidence: ['Detected as missing skill in analysis'], sources: ['missing_signal'] },
];

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);

try {
  const comparison = compareSkillVectors(fromSkillVector, toSkillVector);
  const testing = comparison.skillChanges.find((item) => item.canonicalSkillName === 'Testing');
  const docker = comparison.skillChanges.find((item) => item.canonicalSkillName === 'Docker');
  const cicd = comparison.skillChanges.find((item) => item.canonicalSkillName === 'CI/CD');
  if (!testing || !comparison.improvedSkills.includes(testing) || !comparison.resolvedMissingSkills.includes('Testing')) {
    fail('Testing improvement/resolution was not detected');
  }
  if (!docker || docker.status !== 'improved') fail('Docker improvement was not detected');
  if (!cicd || cicd.status !== 'still_missing' || !comparison.remainingMissingSkills.includes('CI/CD')) {
    fail('Remaining CI/CD gap was not detected');
  }
  if (comparison.skillSummary.improvedCount < 2 || comparison.skillSummary.remainingMissingCount < 1) {
    fail('Skill summary counts are incorrect');
  }
  pass('improved and remaining missing skills are detected');

  const emptyComparison = compareSkillVectors(null, undefined);
  if (emptyComparison.skillChanges.length || emptyComparison.skillSummary.totalComparedSkills !== 0) {
    fail('Empty vectors should produce an empty comparison');
  }
  pass('empty vectors are handled safely');

  const newComparison = compareSkillVectors([], [
    { skill: 'Express.js', canonicalSkillName: 'Express.js', score: 0.8, level: 'strong' },
    { skill: 'Testing', canonicalSkillName: 'Testing', score: 0, level: 'missing' },
  ]);
  const newExpress = newComparison.skillChanges.find((item) => item.canonicalSkillName === 'Express.js');
  const missingTesting = newComparison.skillChanges.find((item) => item.canonicalSkillName === 'Testing');
  if (newExpress?.status !== 'new' || missingTesting?.status !== 'still_missing') {
    fail('Comparison from an old snapshot without vector is incorrect');
  }
  pass('old snapshots without vectors are handled safely');

  const rootComparison = buildComparisonResult(
    {
      _id: 'from',
      repositoryId: 'repo',
      scores: {},
      checklist: {},
      missingSkills: ['Testing', 'CI/CD', 'Code Quality', 'Clean Code'],
      skillVector: [],
    },
    {
      _id: 'to',
      repositoryId: 'repo',
      scores: {},
      checklist: {},
      missingSkills: ['Testing', 'CI/CD', 'Clean Code'],
      skillVector: [],
    }
  );
  if (
    rootComparison.resolvedMissingSkills.length ||
    rootComparison.newMissingSkills.length ||
    JSON.stringify(rootComparison.remainingMissingSkills) !==
      JSON.stringify(['Testing', 'CI/CD', 'Clean Code'])
  ) {
    fail(`Root missing skill canonicalization failed: ${JSON.stringify(rootComparison)}`);
  }
  if (rootComparison.summary.includes('đã được xử lý: Code Quality')) {
    fail('Root summary incorrectly reports Code Quality as resolved');
  }
  pass('root missingSkills comparison uses canonical names without duplicates');

  console.log('All skill vector comparison tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
