const {
  buildRoadmapSkillGapFromAnalysis,
} = require('../src/services/roadmapSkillGap.service');
const { isKnownSkill } = require('../src/utils/skillCanonicalizer');
const {
  applyRoadmapSkillGapPriorities,
  normalizeRoadmapPayload,
} = require('../src/services/roadmap.service');
const { extractRoadmapSkills } = require('../src/services/roadmapProgress.service');

const analysis = {
  careerDirection: 'Backend Developer',
  skillVector: [
    { skill: 'Express.js', canonicalSkillName: 'Express.js', category: 'Backend', score: 0.9772, level: 'strong' },
    { skill: 'REST API', canonicalSkillName: 'REST API', category: 'Backend', score: 0.8583, level: 'strong' },
    { skill: 'JWT Authentication', canonicalSkillName: 'JWT Authentication', category: 'Backend', score: 0.9829, level: 'strong' },
    { skill: 'MongoDB', canonicalSkillName: 'MongoDB', category: 'Database', score: 0.7425, level: 'strong' },
    { skill: 'Mongoose', canonicalSkillName: 'Mongoose', category: 'Database', score: 0.9884, level: 'strong' },
    { skill: 'Node.js', canonicalSkillName: 'Node.js', category: 'Backend', score: 0.495, level: 'developing' },
    { skill: 'Testing', canonicalSkillName: 'Testing', category: 'Testing', score: 0, level: 'missing' },
    { skill: 'CI/CD', canonicalSkillName: 'CI/CD', category: 'DevOps', score: 0, level: 'missing' },
    { skill: 'Clean Code', canonicalSkillName: 'Clean Code', category: 'Code Quality', score: 0, level: 'missing' },
  ],
  missingSkills: ['Testing', 'CI/CD', 'Clean Code'],
};

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};
const pass = (message) => console.log(`PASS: ${message}`);

try {
  const result = buildRoadmapSkillGapFromAnalysis(analysis, {
    targetRole: 'Backend Developer',
    level: 'beginner',
    durationWeeks: 6,
    language: 'vi',
  });
  if (result.source !== 'role_matching' || result.selectedRoleMatch?.roleId !== 'backend-developer') {
    fail('Backend role match was not selected');
  }
  const priorities = result.prioritySkills;
  for (const name of ['Testing', 'Clean Code', 'API Testing']) {
    if (!priorities.includes(name)) fail(`Priority skills missing ${name}`);
  }
  if (!priorities.includes('CI/CD') && !priorities.includes('GitHub Actions')) {
    fail('Priority skills should include CI/CD or GitHub Actions');
  }
  for (const strong of ['Express.js', 'MongoDB', 'Mongoose', 'JWT Authentication']) {
    if (priorities.slice(0, 8).includes(strong)) fail(`Strong skill ${strong} should not be prioritized`);
  }
  if (priorities.includes('Code Quality')) fail('Legacy Code Quality name leaked');
  if (new Set(priorities).size !== priorities.length) fail('Priority skills contain duplicates');
  if (priorities.some((name) => !isKnownSkill(name))) fail('Priority skills contain non-canonical names');
  pass('role matching produces canonical prioritized skill gaps');

  const fallback = buildRoadmapSkillGapFromAnalysis(
    { careerDirection: 'Backend Developer', missingSkills: ['Code Quality', 'Testing'] },
    { targetRole: 'Backend Developer' }
  );
  if (
    fallback.source !== 'fallback_analysis' ||
    JSON.stringify(fallback.prioritySkills) !== JSON.stringify(['Clean Code', 'Testing'])
  ) {
    fail(`Fallback gap is incorrect: ${JSON.stringify(fallback)}`);
  }
  pass('analysis fallback canonicalizes missing skills');

  const roadmap = applyRoadmapSkillGapPriorities(
    {
      mainPath: {
        phases: [
          {
            title: 'Backend quality',
            skills: [],
            tasks: [
              { title: 'Add tests', skillTags: [] },
              { title: 'Improve quality', skillTags: [] },
            ],
          },
        ],
      },
    },
    result
  );
  const progressSkills = extractRoadmapSkills(roadmap).map((item) => item.skillName);
  for (const name of ['Testing', 'Clean Code']) {
    if (!progressSkills.includes(name)) fail(`Progress extraction missing ${name}`);
  }
  if (new Set(progressSkills).size !== progressSkills.length) {
    fail('Progress extraction contains duplicate skills');
  }
  pass('new roadmap tasks remain compatible with progress extraction');

  const normalizedPayload = normalizeRoadmapPayload({
    userId: '507f1f77bcf86cd799439011',
    targetRole: 'Backend Developer',
    roadmapGapContext: result,
    sourceContextSummary: {
      repositoriesCount: 1,
      detectedSkills: ['JWT Auth', 'MongoDB/Mongoose'],
      missingSkills: ['Code Quality', 'CICD'],
    },
    roadmapData: {
      targetRole: 'Backend Developer',
      mainPath: {
        title: 'Backend gap path',
        phases: [
          {
            title: 'Quality and testing',
            skills: ['Code Quality', 'CICD'],
            tasks: [
              { title: 'Tìm hiểu và áp dụng nguyên tắc Clean Code', skillTags: ['API Security'] },
              { title: 'Cấu hình ESLint và Prettier', skillTags: ['Node.js'], resources: [{ title: 'Docs', url: '' }] },
              { title: 'Viết Integration Tests cho WDP_G3', skillTags: ['CI/CD'], resources: [{ title: 'Course', url: 'https://example.com' }] },
              { title: 'Tìm hiểu OWASP API Security', skillTags: ['Testing'], resources: [null] },
            ],
          },
          {
            title: 'Automation',
            skills: ['CICD'],
            tasks: [{ title: 'Tìm hiểu GitHub Actions', skillTags: ['Node.js'] }],
          },
        ],
      },
      supportingPaths: [
        {
          title: 'Job readiness',
          reason: '',
          skills: ['Code Quality', 'CICD', 'JWT Auth'],
          suggestedTasks: [
            {
              title: 'Chuẩn hóa README',
              description: 'Mô tả cách chạy project và các kỹ năng chính.',
              skillTags: ['Code Quality'],
            },
          ],
        },
        { title: 'Extension', reason: '', skills: ['MongoDB/Mongoose'], suggestedTasks: [] },
      ],
    },
  });
  const serialized = JSON.stringify(normalizedPayload);
  if (serialized.includes('[object Object]')) fail('suggestedTasks contains [object Object]');
  const roadmapSkillNames = [
    ...normalizedPayload.sourceContextSummary.missingSkills,
    ...normalizedPayload.skillGapSummary.recommendedNextSkills,
    ...normalizedPayload.skillGapSummary.prioritySkills,
    ...normalizedPayload.mainPath.phases.flatMap((phase) => [
      ...phase.skills,
      ...phase.tasks.flatMap((task) => [
        task.skillName,
        task.canonicalSkillName,
        ...task.skillTags,
      ]),
    ]),
    ...normalizedPayload.supportingPaths.flatMap((path) => path.skills),
  ];
  if (roadmapSkillNames.some((name) => ['Code Quality', 'CICD', 'JWT Auth'].includes(name))) {
    fail(`Legacy skill alias leaked: ${JSON.stringify(roadmapSkillNames)}`);
  }
  const tasks = normalizedPayload.mainPath.phases.flatMap((phase) => phase.tasks);
  const taskByTitle = new Map(tasks.map((task) => [task.title, task]));
  const expectedPrimarySkills = {
    'Tìm hiểu và áp dụng nguyên tắc Clean Code': ['Clean Code'],
    'Cấu hình ESLint và Prettier': ['Clean Code', 'Linting', 'Formatting'],
    'Viết Integration Tests cho WDP_G3': ['API Testing', 'Testing'],
    'Tìm hiểu OWASP API Security': ['API Security'],
    'Tìm hiểu GitHub Actions': ['CI/CD', 'GitHub Actions'],
  };
  for (const [title, allowedSkills] of Object.entries(expectedPrimarySkills)) {
    const task = taskByTitle.get(title);
    if (!task || !allowedSkills.includes(task.canonicalSkillName)) {
      fail(`${title} has incorrect primary skill: ${task?.canonicalSkillName}`);
    }
    if (task.skillName !== task.canonicalSkillName) {
      fail(`${title} has mismatched skillName and canonicalSkillName`);
    }
    if (task.targetRole !== 'Backend Developer') {
      fail(`${title} is missing targetRole for Learning API`);
    }
    if (!Array.isArray(task.resources) || task.resources.length !== 0) {
      fail(`${title} still returns detailed learning resources`);
    }
  }
  if (
    normalizedPayload.supportingPaths[0].suggestedTasks[0] !==
    'Chuẩn hóa README: Mô tả cách chạy project và các kỹ năng chính.'
  ) {
    fail('suggestedTasks object was not converted to readable text');
  }
  pass('roadmap output is canonical and task primary skills match task content');

  console.log('All roadmap skill gap tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
