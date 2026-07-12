const {
  generateAnalysisInsightsFromSkillVector,
} = require('../src/services/skillInsight.service');

const skillVector = [
  { skill: 'REST API', canonicalSkillName: 'REST API', category: 'Backend', score: 97, level: 'strong' },
  { skill: 'Authentication', canonicalSkillName: 'Authentication', category: 'Backend', score: 98, level: 'strong' },
  { skill: 'Database', canonicalSkillName: 'Database', category: 'Database', score: 74, level: 'strong' },
  { skill: 'Testing', canonicalSkillName: 'Testing', category: 'Testing', score: 0, level: 'missing' },
  { skill: 'CI/CD', canonicalSkillName: 'CI/CD', category: 'DevOps', score: 0, level: 'missing' },
  { skill: 'Clean Code', canonicalSkillName: 'Clean Code', category: 'Code Quality', score: 0, level: 'missing' },
];

const context = {
  careerDirection: 'Backend Developer',
  projectType: 'Backend API',
  checklist: {
    hasTesting: false,
    hasCICD: false,
    hasDocker: true,
    hasDockerCompose: true,
    hasReadme: true,
    hasEnvExample: true,
  },
  scores: { testingScore: 0, deploymentScore: 85, overallScore: 75 },
  commitSummary: { totalCommits: 13, activeDays: 6 },
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);
const contains = (values, text) => values.some((value) => value.includes(text));
const hasDuplicates = (values) => new Set(values.map((value) => value.toLowerCase())).size !== values.length;

try {
  const result = generateAnalysisInsightsFromSkillVector(skillVector, context);

  for (const text of ['REST API', 'xác thực', 'Database']) {
    if (!contains(result.strengths, text)) fail(`strengths thiếu nội dung ${text}`);
  }
  pass('strengths phản ánh các kỹ năng mạnh');

  for (const text of ['automated testing', 'CI/CD', 'code quality']) {
    if (!contains(result.weaknesses, text)) fail(`weaknesses thiếu nội dung ${text}`);
  }
  pass('weaknesses phản ánh các kỹ năng thiếu');

  const expectedMissing = ['CI/CD', 'Clean Code', 'API Testing'];
  if (JSON.stringify(result.missingSkills) !== JSON.stringify(expectedMissing)) {
    fail(`missingSkills không đúng: ${JSON.stringify(result.missingSkills)}`);
  }
  pass('missingSkills dùng canonical name và đúng thứ tự');

  for (const text of ['Supertest', 'GitHub Actions', 'code quality']) {
    if (!contains(result.recommendations, text)) fail(`recommendations thiếu nội dung ${text}`);
  }
  pass('recommendations có hành động tương ứng');

  for (const [name, values] of Object.entries(result)) {
    if (hasDuplicates(values)) fail(`${name} có dữ liệu trùng lặp`);
  }
  pass('không có dữ liệu trùng lặp');

  if (result.weaknesses.some((value) => value.startsWith('Repository ') || value.includes('Repo chua '))) {
    fail('weaknesses còn chứa câu tiếng Anh hoặc tiếng Việt không dấu cũ');
  }
  pass('weaknesses sử dụng nội dung tiếng Việt chuẩn hóa');

  console.log('All skill insight tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
