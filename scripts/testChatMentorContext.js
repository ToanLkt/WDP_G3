const assert = require('assert');
const mongoose = require('mongoose');

const {
  CHAT_INTENTS,
  detectChatIntent,
  detectChatIntents,
  buildChatSkillScoreContext,
  buildRepoComparisonContext,
} = require('../src/services/chatSkillContext.service');
const { buildProgressContext } = require('../src/services/currentContext.service');
const { buildChatContextPrompt } = require('../src/services/ai/chatContext.prompt');
const AnalysisResult = require('../src/models/AnalysisResult');
const Repository = require('../src/models/Repository');
const StudentProfile = require('../src/models/StudentProfile');

const objectId = () => new mongoose.Types.ObjectId();

const assertIntent = (text, expected) => {
  const intents = detectChatIntents(text);
  assert(
    intents.includes(expected),
    `Expected "${text}" to include ${expected}, got ${intents.join(', ')}`
  );
};

async function testIntentDetection() {
  assertIntent('Toi hop Backend hay Frontend hon?', CHAT_INTENTS.ROLE_FIT);
  assertIntent('Tôi hợp Backend hay Frontend hơn?', CHAT_INTENTS.ROLE_FIT);
  assertIntent('Repo nao nen dua vao CV?', CHAT_INTENTS.REPO_COMPARE);
  assertIntent('Repo nào nên đưa vào CV?', CHAT_INTENTS.REPO_COMPARE);
  assertIntent('So sanh WDP_G3 va Plantcare_admin_Web', CHAT_INTENTS.REPO_COMPARE);
  assertIntent('So sánh WDP_G3 và Plantcare_admin_Web', CHAT_INTENTS.REPO_COMPARE);
  assertIntent('Tien do roadmap cua toi the nao?', CHAT_INTENTS.ROADMAP_PROGRESS);
  assertIntent('Tiến độ roadmap của tôi thế nào?', CHAT_INTENTS.ROADMAP_PROGRESS);
  assertIntent('2 tuan toi nen hoc gi truoc?', CHAT_INTENTS.TIMEBOX_PRIORITY);
  assertIntent('2 tuần tới nên học gì trước?', CHAT_INTENTS.TIMEBOX_PRIORITY);
  assertIntent('Toi nen chuan bi phong van Backend ra sao?', CHAT_INTENTS.INTERVIEW_PREP);
  assertIntent('Tôi nên chuẩn bị phỏng vấn Backend ra sao?', CHAT_INTENTS.INTERVIEW_PREP);
  assert.strictEqual(detectChatIntent('Toi hop Backend hay Frontend hon?'), CHAT_INTENTS.ROLE_FIT);
}

async function testSelectedAnalysisContext() {
  const userId = objectId();
  const repositoryId = objectId();
  StudentProfile.findOne = () => ({
    select: () => ({
      lean: async () => ({ targetCareer: 'Backend Developer', currentSkills: ['Node.js'] }),
    }),
  });
  const analysis = {
    _id: objectId(),
    userId,
    repositoryId,
    repoName: 'WDP_G3',
    analyzedAt: new Date('2026-01-01'),
    projectType: 'backend-api',
    languages: ['JavaScript'],
    frameworks: ['Express'],
    packages: ['mongoose'],
    summary: { userReadinessScore: 68, overallScore: 72, confidence: 0.81 },
    skillVector: [
      { skill: 'Node.js', canonicalSkillName: 'Node.js', score: 82, level: 'strong', evidence: [{ source: 'package', path: 'package.json', signal: 'express' }] },
      { skill: 'Testing', canonicalSkillName: 'Testing', score: 35, level: 'weak', reason: 'Few tests' },
    ],
    missingSkills: ['Docker'],
    dev2vec: {
      modelVersion: 'mentor-fixture',
      rolePredictions: [{ roleId: 'backend-developer', roleName: 'Backend Developer', probability: 0.4485, rank: 1 }],
      skillGaps: {
        'backend-developer': {
          matchedSkillNames: ['Node.js'],
          weakSkillNames: ['Testing'],
          missingSkillNames: ['Docker'],
          recommendedNextSkills: ['Testing', 'Docker'],
        },
      },
      sourceStats: { fileCount: 20 },
      evidencePreview: { docs: { readmeRootExists: true } },
    },
  };

  const context = await buildChatSkillScoreContext(userId, { analysis, repositoryId });
  assert.strictEqual(context.readinessScore, 68);
  assert.strictEqual(context.roleProbability, 0.4485);
  assert.strictEqual(context.roleMatchScore, 44.85);
  assert.strictEqual(context.modelVersion, 'mentor-fixture');
  assert(context.skillEvidence.weak.some((skill) => skill.skillName === 'Testing'));
}

async function testRoadmapProgressContext() {
  const roadmap = {
    _id: objectId(),
    targetRole: 'Backend Developer',
    durationWeeks: 4,
    mainRoadmap: {
      phases: [{
        title: 'Week 1',
        tasks: [
          { itemId: 't1', title: 'Write API tests', canonicalSkillName: 'Testing', week: 1, priority: 'high', estimatedHours: 4, description: 'Add integration tests.' },
          { itemId: 't2', title: 'Dockerize app', canonicalSkillName: 'Docker', week: 2, priority: 'medium', estimatedHours: 3 },
        ],
      }],
    },
  };
  const progress = {
    items: [{ itemId: 't1', status: 'in_progress', progressPercent: 40, startedAt: new Date('2026-01-02') }],
    overallProgress: 25,
  };
  const context = buildProgressContext(roadmap, progress);
  assert.strictEqual(context.targetRole, 'Backend Developer');
  assert.strictEqual(context.inProgressTasks[0].week, 1);
  assert.strictEqual(context.inProgressTasks[0].priority, 'high');
  assert.strictEqual(context.inProgressTasks[0].estimatedHours, 4);
  assert.strictEqual(context.inProgressTasks[0].progressPercent, 40);
  assert.strictEqual(context.nextRecommendedTasks[0].itemId, 't1');
}

async function testComparisonContext() {
  const userId = objectId();
  const repoA = objectId();
  const repoB = objectId();
  AnalysisResult.find = () => ({
    sort: () => ({
      limit: () => ({
        select: () => ({
          lean: async () => [
            {
              _id: objectId(),
              userId,
              repositoryId: repoA,
              repoName: 'WDP_G3',
              analyzedAt: new Date('2026-02-02'),
              summary: { userReadinessScore: 70, overallScore: 75 },
              skillVector: [{ skill: 'Express', canonicalSkillName: 'Express', score: 80, level: 'strong' }],
              missingSkills: ['Testing'],
              dev2vec: {
                rolePredictions: [{ roleId: 'backend-developer', roleName: 'Backend Developer', probability: 0.7, rank: 1 }],
                skillGaps: { 'backend-developer': {} },
                sourceStats: { fileCount: 10 },
              },
            },
            {
              _id: objectId(),
              userId,
              repositoryId: repoA,
              repoName: 'WDP_G3_old',
              analyzedAt: new Date('2026-01-01'),
              dev2vec: { rolePredictions: [{ roleId: 'backend-developer', roleName: 'Backend Developer', probability: 0.4, rank: 1 }], skillGaps: { 'backend-developer': {} } },
            },
            {
              _id: objectId(),
              userId,
              repositoryId: repoB,
              repoName: 'Plantcare_admin_Web',
              analyzedAt: new Date('2026-02-01'),
              summary: { userReadinessScore: 60 },
              skillVector: [{ skill: 'React', canonicalSkillName: 'React', score: 76, level: 'strong' }],
              missingSkills: [],
              dev2vec: {
                rolePredictions: [{ roleId: 'frontend-developer', roleName: 'Frontend Developer', probability: 0.6, rank: 1 }],
                skillGaps: { 'frontend-developer': {} },
              },
            },
          ],
        }),
      }),
    }),
  });
  Repository.find = () => ({
    select: () => ({
      lean: async () => [
        { _id: repoA, name: 'WDP_G3', fullName: 'user/WDP_G3' },
        { _id: repoB, name: 'Plantcare_admin_Web', fullName: 'user/Plantcare_admin_Web' },
      ],
    }),
  });

  const context = await buildRepoComparisonContext(userId, 'So sanh WDP_G3 va Plantcare_admin_Web');
  assert.strictEqual(context.length, 2);
  assert.strictEqual(context[0].repoName, 'WDP_G3');
  assert(context.every((repo) => repo.topRole));
}

async function testPromptSections() {
  const prompt = buildChatContextPrompt({
    intent: CHAT_INTENTS.CV_ADVICE,
    intents: [CHAT_INTENTS.REPO_COMPARE, CHAT_INTENTS.CV_ADVICE],
    skillScoreContext: { hasSkillScoreData: true },
    userQuestion: 'Repo nao nen dua vao CV?',
    selectedContext: { repoName: 'WDP_G3' },
    selectedContextIsExplicit: true,
    roadmapProgressContext: null,
    multiRepoComparisonContext: [{ repoName: 'WDP_G3' }],
    cvInterviewContext: [{ projectName: 'WDP_G3' }],
  });
  assert(prompt.includes('SELECTED_CONTEXT'));
  assert(prompt.includes('MULTI_REPO_COMPARISON_CONTEXT'));
  assert(prompt.includes('CV_INTERVIEW_CONTEXT'));
  assert(prompt.includes('If the user asks to compare repositories'));
  assert(prompt.includes('do not invent repo features'));
}

async function main() {
  await testIntentDetection();
  await testSelectedAnalysisContext();
  await testRoadmapProgressContext();
  await testComparisonContext();
  await testPromptSections();
  console.log('Chat mentor context harness passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
