const {
  buildSnapshotPayload,
  buildSkillVectorSummary,
} = require('../src/services/snapshot.service');

const analysis = {
  userId: 'user_id',
  repositoryId: 'repo_id',
  githubRepoId: 123,
  repoName: 'WDP_G3',
  fullName: 'ToanLkt/WDP_G3',
  projectType: 'Backend API',
  careerDirection: 'Backend Developer',
  languages: ['javascript'],
  frameworks: ['Express.js'],
  packages: ['express'],
  configs: ['Docker'],
  skillSignals: ['REST API'],
  careerSignals: ['Backend Developer'],
  strengths: ['Repo thể hiện năng lực xây dựng backend API với Express.js.'],
  weaknesses: ['Repo chưa có tín hiệu automated testing rõ ràng.'],
  missingSkills: ['Testing'],
  recommendations: ['Nên bổ sung automated testing bằng Jest, Vitest hoặc Supertest.'],
  scores: { overallScore: 75, testingScore: 0 },
  commitSummary: { totalCommits: 13, activeDays: 6 },
  checklist: { hasTesting: false, hasDocker: true },
  skillEvidence: [
    {
      skill: 'Express.js',
      canonicalSkillName: 'Express.js',
      normalizedSkillName: 'express.js',
      category: 'Backend',
      source: 'package',
      sourceValue: 'express',
      weight: 0.9,
      confidence: 0.9,
      note: 'Detected package: express',
    },
  ],
  skillVector: [
    {
      skill: 'Express.js',
      canonicalSkillName: 'Express.js',
      normalizedSkillName: 'express.js',
      category: 'Backend',
      score: 0.97,
      level: 'strong',
      evidence: ['Detected package: express'],
      sources: ['package'],
      lastCalculatedAt: new Date(),
    },
    {
      skill: 'Testing',
      canonicalSkillName: 'Testing',
      normalizedSkillName: 'testing',
      category: 'Testing',
      score: 0,
      level: 'missing',
      evidence: ['Detected as missing skill in analysis'],
      sources: ['missing_signal'],
      lastCalculatedAt: new Date(),
    },
  ],
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);

try {
  const payload = buildSnapshotPayload(analysis);
  if (payload.skillEvidence.length !== 1) fail('skillEvidence was not copied');
  if (payload.skillVector.length !== 2) fail('skillVector was not copied');
  pass('skillEvidence and skillVector are copied');

  const expressSkill = payload.skillVector.find((item) => item.canonicalSkillName === 'Express.js');
  const testingSkill = payload.skillVector.find((item) => item.canonicalSkillName === 'Testing');
  if (!expressSkill || !testingSkill || testingSkill.level !== 'missing') fail('Expected vector skills are missing');
  pass('Express.js and missing Testing are preserved');

  if (!payload.scores || !payload.checklist || payload.missingSkills[0] !== 'Testing') {
    fail('Existing snapshot fields were lost');
  }
  pass('Existing snapshot fields are preserved');

  const fallbackPayload = buildSnapshotPayload({ ...analysis, skillEvidence: undefined, skillVector: undefined });
  if (fallbackPayload.skillVector.length !== 0 || fallbackPayload.skillEvidence.length !== 0) {
    fail('Missing vector fields should default to empty arrays');
  }
  pass('Old analysis data defaults to empty vector arrays');

  const summary = buildSkillVectorSummary(payload.skillVector);
  if (summary.totalSkills !== 2 || summary.strongSkills !== 1 || summary.missingSkills !== 1) {
    fail(`Unexpected vector summary: ${JSON.stringify(summary)}`);
  }
  pass('skillVectorSummary is calculated correctly');

  console.log('All snapshot vector mapper tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
