const {
  buildRoadmapSkillGapFromAnalysis,
} = require('../src/services/roadmapSkillGap.service');
const { isKnownSkill } = require('../src/utils/skillCanonicalizer');
const {
  applyRoadmapSkillGapPriorities,
  normalizeRoadmapPayload,
} = require('../src/services/roadmap.service');
const { extractRoadmapSkills } = require('../src/services/roadmapProgress.service');
const { extractRoadmapTasks } = require('../src/services/roadmapLearning.service');

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
  if (result.source !== 'analysis' || result.selectedRoleMatch?.roleName !== 'Backend Developer') {
    fail('Backend role match was not selected');
  }
  const priorities = result.prioritySkills;
  for (const name of ['API Testing', 'Clean Code']) {
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
    fallback.source !== 'analysis' ||
    JSON.stringify(fallback.prioritySkills) !== JSON.stringify(['Clean Code', 'API Testing'])
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
              { itemId: 'main-1-1-testing', title: 'Add tests', canonicalSkillName: 'Testing', skillTags: [] },
              { itemId: 'main-1-2-clean-code', title: 'Improve quality', canonicalSkillName: 'Clean Code', skillTags: [] },
            ],
          },
        ],
      },
    },
    result
  );
  const progressItems = extractRoadmapSkills(roadmap);
  const progressItemIds = progressItems.map((item) => item.itemId);
  if (progressItems.some((item) => !item.itemId)) {
    fail('Progress extraction contains empty itemId');
  }
  if (progressItemIds.some((itemId) => !/^main-\d+-\d+-[a-z0-9-]+$/.test(itemId))) {
    fail(`Progress extraction contains invalid main itemId: ${JSON.stringify(progressItemIds)}`);
  }
  if (new Set(progressItemIds).size !== progressItemIds.length) {
    fail('Progress extraction contains duplicate itemId');
  }
  pass('new roadmap tasks remain compatible with task-level progress extraction');

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
    'Cấu hình ESLint và Prettier': ['Clean Code', 'Linting', 'Formatting', 'CI/CD'],
    'Viết Integration Tests cho WDP_G3': ['API Testing', 'Testing'],
    'Tìm hiểu OWASP API Security': ['API Security', 'REST API'],
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

  const sixWeekPayload = normalizeRoadmapPayload({
    userId: '507f1f77bcf86cd799439011',
    targetRole: 'Backend Developer',
    durationWeeks: 6,
    effectiveLevel: 'intermediate',
    roadmapGapContext: {
      ...result,
      skillGaps: [
        { canonicalSkillName: 'REST API', priority: 'high', gapType: 'missing', category: 'Backend' },
        { canonicalSkillName: 'Authentication', priority: 'high', gapType: 'missing', category: 'Backend' },
        { canonicalSkillName: 'Docker Basics', priority: 'medium', gapType: 'weak', category: 'backend' },
        { canonicalSkillName: 'API Testing', priority: 'high', gapType: 'missing', category: 'Testing' },
        { canonicalSkillName: 'Database', priority: 'medium', gapType: 'weak', category: 'backend' },
        { canonicalSkillName: 'Clean Code', priority: 'medium', gapType: 'weak', category: 'Code Quality' },
      ],
    },
    sourceContextSummary: { repositoriesCount: 1, detectedSkills: [], missingSkills: [] },
    roadmapData: {
      targetRole: 'Backend Developer',
      mainPath: {
        title: 'Backend 6 week path',
        phases: [
          {
            title: 'Week 1',
            tasks: [
              {
                title: 'Xay dung API CRUD cho tai nguyen don gian',
                description: 'Tao routes, controllers va endpoints CRUD.',
                canonicalSkillName: 'React UI',
                week: 1,
              },
            ],
          },
          {
            title: 'Week 2',
            tasks: [
              {
                title: 'Dong goi ung dung Backend voi Docker',
                description: 'Viet Dockerfile va chay backend trong container.',
                canonicalSkillName: 'React UI',
                week: 2,
              },
            ],
          },
          {
            title: 'Week 3',
            tasks: [
              {
                title: 'Trien khai xac thuc JWT va RBAC',
                description: 'Bao ve route bang token va permissions.',
                canonicalSkillName: 'State Management',
                week: 3,
              },
            ],
          },
          {
            title: 'Week 4',
            tasks: [
              {
                title: 'Viet kiem thu tich hop cho API',
                description: 'Dung Jest va Supertest cho endpoints.',
                canonicalSkillName: 'Frontend Testing',
                week: 4,
              },
            ],
          },
        ],
      },
      supportingPaths: [],
    },
  });

  if (sixWeekPayload.durationWeeks !== 6) fail('durationWeeks should preserve requested 6 weeks');
  const sixWeekTasks = sixWeekPayload.mainPath.phases.flatMap((phase) => phase.tasks);
  const weeks = [...new Set(sixWeekTasks.map((task) => task.week))].sort((a, b) => a - b);
  if (JSON.stringify(weeks) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
    fail(`Six-week roadmap is missing week coverage: ${JSON.stringify(weeks)}`);
  }
  const frontendOnly = ['React UI', 'Responsive Design', 'Component Design', 'State Management', 'Frontend Testing'];
  const leakedFrontendSkill = sixWeekTasks.find((task) => frontendOnly.includes(task.canonicalSkillName));
  if (leakedFrontendSkill) {
    fail(`Backend roadmap leaked frontend-only skill: ${JSON.stringify(leakedFrontendSkill)}`);
  }
  const dockerTask = sixWeekTasks.find((task) => /Docker/i.test(task.title));
  if (!dockerTask || !['Docker Basics', 'Docker Compose', 'Deployment'].includes(dockerTask.canonicalSkillName)) {
    fail(`Docker task has wrong canonical skill: ${dockerTask?.canonicalSkillName}`);
  }
  const apiTask = sixWeekTasks.find((task) => /CRUD/i.test(task.title));
  if (!apiTask || !['REST API', 'Swagger', 'Validation'].includes(apiTask.canonicalSkillName)) {
    fail(`API task has wrong canonical skill: ${apiTask?.canonicalSkillName}`);
  }
  const itemIds = [
    ...sixWeekTasks.map((task) => task.itemId),
    ...sixWeekPayload.alternativeRoadmaps.flatMap((roadmap) => roadmap.tasks.map((task) => task.itemId)),
  ];
  if (new Set(itemIds).size !== itemIds.length) fail('Roadmap itemId values are not unique');
  if (!apiTask.itemId.includes('xay-dung-api-crud')) {
    fail(`itemId should include task title context: ${apiTask.itemId}`);
  }

  const learningItems = extractRoadmapTasks(sixWeekPayload);
  const learningApiTask = learningItems.find((task) => task.itemId === apiTask.itemId);
  if (!learningApiTask || learningApiTask.title !== apiTask.title || learningApiTask.canonicalSkillName !== apiTask.canonicalSkillName) {
    fail('Learning availability extraction does not preserve task title/canonicalSkillName context');
  }
  pass('Backend 6-week roadmap is repaired, role-safe, and exposes unique task-specific itemIds');

  const frontendFiveWeekPayload = normalizeRoadmapPayload({
    userId: '507f1f77bcf86cd799439011',
    targetRole: 'Frontend Developer',
    durationWeeks: 5,
    effectiveLevel: 'intermediate',
    roadmapGapContext: {
      skillGaps: [
        { canonicalSkillName: 'React UI', priority: 'high', gapType: 'missing', category: 'frontend' },
        { canonicalSkillName: 'Component Design', priority: 'high', gapType: 'missing', category: 'frontend' },
        { canonicalSkillName: 'State Management', priority: 'medium', gapType: 'missing', category: 'frontend' },
        { canonicalSkillName: 'API Integration', priority: 'medium', gapType: 'weak', category: 'Frontend' },
        { canonicalSkillName: 'Frontend Testing', priority: 'high', gapType: 'missing', category: 'frontend' },
        { canonicalSkillName: 'Responsive Design', priority: 'medium', gapType: 'missing', category: 'Frontend' },
        { canonicalSkillName: 'Accessibility', priority: 'medium', gapType: 'missing', category: 'Frontend' },
        { canonicalSkillName: 'Performance Optimization', priority: 'medium', gapType: 'weak', category: 'Frontend' },
        { canonicalSkillName: 'Documentation', priority: 'low', gapType: 'weak', category: 'General' },
      ],
    },
    sourceContextSummary: { repositoriesCount: 1, detectedSkills: [], missingSkills: [] },
    roadmapData: {
      targetRole: 'Frontend Developer',
      mainPath: {
        title: 'Frontend 5 week path',
        phases: [
          {
            title: 'Week 1',
            tasks: [{ title: 'Xay dung man hinh React UI dau tien', description: 'Tao page va form co ban.', canonicalSkillName: 'React UI', week: 1 }],
          },
          {
            title: 'Week 2',
            tasks: [
              { title: 'Tach UI thanh component reusable', description: 'Thiet ke props va composition.', canonicalSkillName: 'Component Design', week: 2 },
              { title: 'Ket noi API bang Axios va xu ly loading error', description: 'Fetch du lieu cho component.', canonicalSkillName: 'Component Design', week: 2 },
              { title: 'Viet tai lieu Storybook cho component', description: 'Mo ta props va state.', canonicalSkillName: 'Component Design', week: 2 },
            ],
          },
          {
            title: 'Week 3',
            tasks: [
              { title: 'Quan ly global state bang Context hoac Redux', description: 'Tao store cho user state.', canonicalSkillName: 'State Management', week: 3 },
              { title: 'Them accessibility ARIA va keyboard navigation', description: 'Dam bao form accessible.', canonicalSkillName: 'State Management', week: 3 },
              { title: 'Toi uu performance render va lazy load', description: 'Giam bundle va re-render.', canonicalSkillName: 'State Management', week: 3 },
            ],
          },
          {
            title: 'Week 4',
            tasks: [
              { title: 'Viet component test bang React Testing Library', description: 'Test tuong tac UI.', canonicalSkillName: 'Frontend Testing', week: 4 },
              { title: 'Responsive layout cho mobile breakpoint', description: 'Hoan thien mobile UI.', canonicalSkillName: 'Frontend Testing', week: 4 },
            ],
          },
          {
            title: 'Week 5',
            tasks: [
              { title: 'Hoan thien responsive design va polish UI', description: 'Kiem tra desktop mobile.', canonicalSkillName: 'Responsive Design', week: 5 },
              { title: 'Viet README va huong dan demo frontend', description: 'Tai lieu setup va demo.', canonicalSkillName: 'Responsive Design', week: 5 },
            ],
          },
        ],
      },
      supportingPaths: [
        {
          title: 'Backend collaboration',
          reason: 'Giup frontend developer phoi hop voi API backend.',
          skills: ['REST API', 'Database', 'Authentication', 'Docker Basics'],
          suggestedTasks: [
            'Doc REST API contract va mapping response vao UI',
            'Hieu authentication token flow khi goi protected API',
          ],
        },
      ],
    },
  });

  const frontendTasks = frontendFiveWeekPayload.mainPath.phases.flatMap((phase) => phase.tasks);
  const frontendWeeks = [...new Set(frontendTasks.map((task) => task.week))].sort((a, b) => a - b);
  if (JSON.stringify(frontendWeeks) !== JSON.stringify([1, 2, 3, 4, 5])) {
    fail(`Frontend five-week roadmap is missing week coverage: ${JSON.stringify(frontendWeeks)}`);
  }
  const frontendIds = [
    ...frontendTasks.map((task) => task.itemId),
    ...frontendFiveWeekPayload.alternativeRoadmaps.flatMap((roadmap) => roadmap.tasks.map((task) => task.itemId)),
  ];
  if (new Set(frontendIds).size !== frontendIds.length) fail('Frontend roadmap itemId values are not unique');
  for (const phase of frontendFiveWeekPayload.mainPath.phases) {
    if ((phase.tasks || []).length > 1) {
      const titles = phase.tasks.map((task) => task.title).join(' ');
      const canMapSubSkills = /api|axios|documentation|storybook|accessibility|aria|performance|lazy|responsive|test|component|state|readme/i.test(titles);
      const uniqueWeekSkills = new Set(phase.tasks.map((task) => task.canonicalSkillName));
      if (canMapSubSkills && uniqueWeekSkills.size === 1) {
        fail(`Frontend week ${phase.tasks[0].week} still uses one canonicalSkillName for all tasks: ${[...uniqueWeekSkills][0]}`);
      }
    }
  }
  const crossFunctionalPath = frontendFiveWeekPayload.alternativeRoadmaps.find((roadmap) =>
    roadmap.skills.some((skill) => ['REST API', 'Database', 'Authentication', 'Docker Basics'].includes(skill))
  );
  if (!crossFunctionalPath || crossFunctionalPath.pathType !== 'cross_functional_supporting' || !/supporting|cross-functional/i.test(`${crossFunctionalPath.title} ${crossFunctionalPath.reason}`)) {
    fail(`Alternative roadmap is not clearly marked cross-functional: ${JSON.stringify(crossFunctionalPath)}`);
  }
  pass('Frontend 5-week roadmap diversifies same-week skills and labels cross-functional alternatives');

  const roleDiversificationCases = [
    {
      targetRole: 'Backend Developer',
      repeatedSkill: 'REST API',
      skillGaps: ['REST API', 'Database', 'Authentication', 'Docker Basics', 'API Testing', 'Documentation', 'Clean Code'],
      tasks: [
        'Xay dung CRUD endpoint cho san pham',
        'Thiet ke schema database va index',
        'Them JWT authentication va RBAC',
        'Viet API testing bang Jest Supertest',
      ],
      alternativeSkills: ['React UI', 'Responsive Design'],
    },
    {
      targetRole: 'Mobile Developer',
      repeatedSkill: 'Mobile UI',
      skillGaps: ['Mobile UI', 'Navigation', 'Local Storage', 'API Integration', 'App State Management', 'Documentation', 'Clean Code'],
      tasks: [
        'Xay dung mobile UI cho man hinh profile',
        'Cau hinh stack navigation va deep link',
        'Luu du lieu offline bang AsyncStorage',
        'Ket noi API bang fetch va xu ly loading',
      ],
      alternativeSkills: ['REST API', 'Database'],
    },
    {
      targetRole: 'DevOps Engineer',
      repeatedSkill: 'Docker',
      skillGaps: ['Docker', 'Kubernetes', 'CI/CD', 'Infrastructure as Code', 'Monitoring', 'Documentation'],
      tasks: [
        'Dong goi service bang Dockerfile',
        'Tao Kubernetes deployment va service yaml',
        'Cau hinh CI/CD pipeline bang GitHub Actions',
        'Them monitoring metrics va alert Grafana',
      ],
      alternativeSkills: ['React UI', 'API Integration'],
    },
  ];

  for (const roleCase of roleDiversificationCases) {
    const payload = normalizeRoadmapPayload({
      userId: '507f1f77bcf86cd799439011',
      targetRole: roleCase.targetRole,
      durationWeeks: 5,
      effectiveLevel: 'intermediate',
      roadmapGapContext: {
        skillGaps: roleCase.skillGaps.map((canonicalSkillName) => ({
          canonicalSkillName,
          priority: 'medium',
          gapType: 'missing',
          category: 'General',
        })),
      },
      sourceContextSummary: { repositoriesCount: 1, detectedSkills: [], missingSkills: [] },
      roadmapData: {
        targetRole: roleCase.targetRole,
        mainPath: {
          title: `${roleCase.targetRole} 5 week path`,
          phases: [
            {
              title: 'Week 1',
              tasks: [{ title: `${roleCase.targetRole} foundation`, description: 'Task co ban.', canonicalSkillName: roleCase.repeatedSkill, week: 1 }],
            },
            {
              title: 'Week 2',
              tasks: roleCase.tasks.map((title) => ({
                title,
                description: title,
                canonicalSkillName: roleCase.repeatedSkill,
                week: 2,
              })),
            },
            { title: 'Week 3', tasks: [{ title: `${roleCase.targetRole} practice week 3`, description: 'Practice.', canonicalSkillName: roleCase.repeatedSkill, week: 3 }] },
            { title: 'Week 4', tasks: [{ title: `${roleCase.targetRole} practice week 4`, description: 'Practice.', canonicalSkillName: roleCase.repeatedSkill, week: 4 }] },
            { title: 'Week 5', tasks: [{ title: `${roleCase.targetRole} practice week 5`, description: 'Practice.', canonicalSkillName: roleCase.repeatedSkill, week: 5 }] },
          ],
        },
        supportingPaths: [
          {
            title: 'Cross role support',
            reason: 'Bo sung kha nang phoi hop voi role khac.',
            skills: roleCase.alternativeSkills,
            suggestedTasks: roleCase.alternativeSkills.map((skill) => `Tim hieu ${skill} de phoi hop cross-functional`),
          },
        ],
      },
    });

    const tasks = payload.mainPath.phases.flatMap((phase) => phase.tasks);
    const weeks = [...new Set(tasks.map((task) => task.week))].sort((a, b) => a - b);
    if (JSON.stringify(weeks) !== JSON.stringify([1, 2, 3, 4, 5])) {
      fail(`${roleCase.targetRole} five-week roadmap is missing week coverage: ${JSON.stringify(weeks)}`);
    }
    const ids = [
      ...tasks.map((task) => task.itemId),
      ...payload.alternativeRoadmaps.flatMap((roadmap) => roadmap.tasks.map((task) => task.itemId)),
    ];
    if (new Set(ids).size !== ids.length) fail(`${roleCase.targetRole} roadmap itemId values are not unique`);
    const weekTwo = payload.mainPath.phases[1].tasks;
    if (new Set(weekTwo.map((task) => task.canonicalSkillName)).size < 2) {
      fail(`${roleCase.targetRole} week 2 was not diversified: ${JSON.stringify(weekTwo)}`);
    }
    const crossPath = payload.alternativeRoadmaps.find((roadmap) => roadmap.pathType === 'cross_functional_supporting');
    if (!crossPath || !/supporting|cross-functional/i.test(`${crossPath.title} ${crossPath.reason}`)) {
      fail(`${roleCase.targetRole} alternative path is not marked cross-functional: ${JSON.stringify(payload.alternativeRoadmaps)}`);
    }
  }
  pass('Backend, Mobile, and DevOps roadmaps diversify same-week skills and label cross-functional alternatives');

  console.log('All roadmap skill gap tests passed.');
} catch (error) {
  fail(error.stack || error.message);
}
