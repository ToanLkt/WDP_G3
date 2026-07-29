const assert = require('assert');
const { normalizeRoadmapPayload } = require('../src/services/roadmap.service');
const { buildResourceSearchContext } = require('../src/services/learning.service');
const { calculateYouTubeVideoScore } = require('../src/services/youtube.service');

const gaps = (names) => names.map((canonicalSkillName) => ({
  canonicalSkillName,
  skillName: canonicalSkillName,
  gapType: 'missing',
  priority: 'high',
}));

const payload = normalizeRoadmapPayload({
  userId: '000000000000000000000001',
  targetRole: 'Backend Developer',
  effectiveLevel: 'intermediate',
  durationWeeks: 3,
  language: 'vi',
  sourceContextSummary: { detectedSkills: ['Node.js', 'Express.js', 'MongoDB'] },
  roadmapGapContext: { skillGaps: gaps(['Database', 'Authentication', 'API Testing']) },
  roadmapData: {
    mainPath: {
      phases: [
        { title: 'Week 1', tasks: [{ title: 'REST API basics', description: 'CRUD endpoints', canonicalSkillName: 'Database', week: 1 }] },
        { title: 'Week 2', tasks: [{ title: 'REST API basics', description: 'CRUD endpoints', canonicalSkillName: 'Database', week: 2 }] },
        { title: 'Week 3', tasks: [{ title: 'REST API basics', description: 'CRUD endpoints', canonicalSkillName: 'Database', week: 3 }] },
      ],
    },
    supportingPaths: [],
  },
});

const tasks = payload.mainRoadmap.phases.flatMap((phase) => phase.tasks);
for (const skill of ['Database', 'Authentication', 'API Testing']) {
  assert(tasks.some((task) => task.canonicalSkillName === skill), `missing required ${skill} task`);
}
const auth = tasks.find((task) => task.canonicalSkillName === 'Authentication');
assert(/JWT/i.test(auth.title));
assert(/Express/i.test(auth.title));
assert(payload.mainRoadmap.phases[1].tasks.every((task) => task.prerequisites.length > 0));

const mongo = buildResourceSearchContext({
  skillName: 'Database',
  targetRole: 'Backend Developer',
  level: 'intermediate',
  taskTitle: 'Tối ưu thiết kế schema MongoDB nâng cao',
});
const jwt = buildResourceSearchContext({
  skillName: 'Authentication',
  targetRole: 'Backend Developer',
  level: 'intermediate',
  taskTitle: 'Củng cố JWT và middleware',
});
const jsx = buildResourceSearchContext({
  skillName: 'React UI',
  targetRole: 'Frontend Developer',
  level: 'intermediate',
  taskTitle: 'Củng cố JSX và cơ chế rendering trong React',
});
assert(/MongoDB advanced schema design/.test(mongo.primaryQuery));
assert(/JWT authentication middleware Node\.js Express/.test(jwt.primaryQuery));
assert(/JSX rendering reconciliation virtual DOM/.test(jsx.primaryQuery));
assert(!/performance optimization/i.test(jsx.primaryQuery));
assert.notStrictEqual(mongo.topicCacheKey, jwt.topicCacheKey);

const score = (title, context, skillName) => calculateYouTubeVideoScore({
  title,
  description: '',
  channelTitle: 'Trusted learning channel',
  skillName,
  level: 'intermediate',
  ...context,
});
assert(score('Build REST APIs in .NET 9', mongo, 'Database') < 40);
assert(score('REST API Crash Course Python', jwt, 'Authentication') < 40);
assert(score('React Performance Optimization', jsx, 'React UI') < 40);
assert(score('MongoDB Schema Design and Data Modeling Tutorial', mongo, 'Database') >= 40);
assert(score('JWT Authentication Middleware in Node.js Express Tutorial', jwt, 'Authentication') >= 40);
assert(score('React JSX Rendering Reconciliation and Virtual DOM', jsx, 'React UI') >= 40);

console.log('PASS: roadmap/resource grounding and relevance gates');
