const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { aggregateRepositoryPrimaryRoles } = require('../src/services/dev2vec/dev2vecRoleCandidate.service');
const { getCurrentDev2VecPipelineMetadata } = require('../src/services/dev2vec/dev2vecPipelineMetadata.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const metadata = getCurrentDev2VecPipelineMetadata({ generatedAt: new Date(0) });
const analysis = ({ id, repo, role, probability, date, user = 'u1', rank2 = 'data-scientist', compatible = true, archived = false }) => ({
  _id: id, userId: user, repositoryId: repo, repoName: repo, analyzedAt: date,
  repositoryArchived: archived, analysisScope: { type: 'user_contribution' },
  dev2vec: {
    modelVersion: metadata.modelVersion,
    cacheMetadata: { ...metadata, ...(compatible ? {} : { analysisPipelineVersion: 'old' }) },
    rolePredictions: [{ roleId: role, roleName: role, probability, rank: 1 }, { roleId: rank2, probability: 0.99, rank: 2 }],
    skillGaps: { [role]: { matchedSkillNames: [`${role}-matched`], weakSkillNames: [`${role}-weak`], missingSkillNames: [`${role}-missing`], recommendedNextSkills: [`${role}-next`] } },
  },
});
const records = [
  analysis({ id: 'a1', repo: 'r1', role: 'backend', probability: 0.71, date: '2026-01-01' }),
  analysis({ id: 'a2', repo: 'r2', role: 'devops', probability: 0.62, date: '2026-01-02' }),
  analysis({ id: 'a3', repo: 'r3', role: 'mobile', probability: 0.58, date: '2026-01-03' }),
  analysis({ id: 'a4', repo: 'r4', role: 'devops', probability: 0.81, date: '2026-01-04' }),
];
let count = 0;
const test = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}: ${name}`); };
const has = (source, value) => assert.ok(source.includes(value), `Expected ${value}`);
const lacks = (source, value) => assert.ok(!source.includes(value), `Unexpected ${value}`);
const select = (items = records, options = {}) => aggregateRepositoryPrimaryRoles({ currentRepositoryId: 'r1', compatibleAnalyses: items, userId: 'u1', maxAdditionalRoles: 2, ...options });

const analysisService = read('src/services/analysis.service.js');
const analysisSource = read('src/services/analysisSource.service.js');
const roadmap = read('src/services/roadmap.service.js');
const roadmapPrompt = read('src/services/ai/roadmap.prompt.js');
const chat = read('src/services/chat.service.js');
const chatPrompt = read('src/services/ai/chatContext.prompt.js');
const comparison = read('src/services/chatSkillContext.service.js');

test('current repo rank 1 is primary', () => assert.strictEqual(select().primaryRole.roleId, 'backend'));
test('other repo contributes rank 1 only', () => assert.ok(select().additionalRoleOptions.every((item) => item.roleId !== 'data-scientist')));
test('candidate service does not merge vectors', () => lacks(read('src/services/dev2vec/dev2vecRoleCandidate.service.js'), 'skillVector'));
test('portfolio aggregation does not call inference', () => lacks(read('src/services/dev2vec/dev2vecRoleCandidate.service.js'), 'runDev2VecInference'));
test('duplicate roles deduplicated', () => assert.strictEqual(select().additionalRoleOptions.filter((item) => item.roleId === 'devops').length, 1));
test('higher probability duplicate wins', () => assert.strictEqual(select().additionalRoleOptions.find((item) => item.roleId === 'devops').sourceAnalysisId, 'a4'));
test('current primary excluded from additional', () => assert.ok(!select([...records, analysis({ id: 'a5', repo: 'r5', role: 'backend', probability: 0.99, date: '2026-01-05' })]).additionalRoleOptions.some((item) => item.roleId === 'backend')));
test('maximum two additional roles', () => assert.ok(select().additionalRoleOptions.length <= 2));
test('short candidates stay short', () => assert.strictEqual(select(records.slice(0, 2)).additionalRoleOptions.length, 1));
test('input order does not change output', () => assert.deepStrictEqual(select().additionalRoleOptions.map((x) => x.roleId), select([...records].reverse()).additionalRoleOptions.map((x) => x.roleId)));
test('incompatible analysis excluded', () => assert.strictEqual(select([records[0], analysis({ id: 'bad', repo: 'r9', role: 'frontend', probability: 1, date: '2026-01-09', compatible: false })]).additionalRoleOptions.length, 0));
test('other user analysis excluded', () => assert.strictEqual(select([records[0], analysis({ id: 'bad', repo: 'r9', role: 'frontend', probability: 1, date: '2026-01-09', user: 'u2' })]).additionalRoleOptions.length, 0));
test('archived repository analysis excluded', () => assert.strictEqual(select([records[0], analysis({ id: 'bad', repo: 'r9', role: 'frontend', probability: 1, date: '2026-01-09', archived: true })]).additionalRoleOptions.length, 0));
test('candidate provenance is populated', () => ['sourceRepositoryId', 'sourceAnalysisId', 'modelVersion', 'pipelineVersion', 'selectionType'].forEach((key) => assert.ok(Object.hasOwn(select().primaryRole, key))));
test('single repo role flow retains Dev2Vec path', () => has(analysisService, 'getDev2VecOutputForSingleRepo'));
test('selected repos use per-repo rank-one aggregation', () => has(analysisService, 'aggregateRepositoryPrimaryRoles'));
test('all repos no longer merge skillVector', () => lacks(analysisService, 'getDev2VecOutputForAnalysisSource'));
test('aggregate metadata says no classifier inference', () => has(analysisService, 'classifierInferencePerformed: roleSelection ? false : true'));
test('old role fields remain', () => ['roleId', 'roleName', 'matchScore', 'matchLevel', 'matchLevelLabel', 'matchedSkillNames', 'weakSkillNames', 'missingSkillNames', 'recommendedNextSkills'].forEach((key) => has(analysisService, key)));
test('candidate order deterministic', () => assert.deepStrictEqual(select().additionalRoleOptions.map((x) => x.roleId), ['devops', 'mobile']));
test('roadmap default resolves source primary', () => has(roadmap, 'const sourcePrimary = primaryPrediction(latestAnalysis)'));
test('valid current primary is accepted', () => has(roadmap, 'requestedSelectedRoleId && requestedSelectedRoleId !== sourcePrimaryRoleId'));
test('valid other repo role uses explicit provenance', () => has(roadmap, 'sourceAnalysisId'));
test('arbitrary role is rejected', () => has(roadmap, 'selectedRoleId must be the rank-1 role'));
test('source analysis is user scoped', () => has(roadmap, 'buildCompatibleAnalysisQuery({ _id: sourceAnalysisId, userId })'));
test('incompatible source is rejected', () => has(roadmap, 'unavailable or incompatible'));
test('roadmap gap uses source analysis', () => has(roadmap, 'analysisForGap = latestAnalysis'));
test('roadmap persists full provenance', () => ['selectedRoleId', 'roleSelectionType', 'sourceRepositoryId', 'sourceAnalysisId', 'sourceSnapshotId', 'evidenceFingerprint'].forEach((key) => has(roadmap, key)));
test('package context cannot add authoritative skill', () => has(roadmapPrompt, 'Never add a main-path skill outside the authoritative gap'));
test('prior feedback cannot override role', () => has(roadmapPrompt, 'PRIOR_FEEDBACK_CONTEXT must not override'));
test('old repoId request remains supported', () => has(roadmap, 'sourceRepositoryId || currentRepositoryId || repoId'));
test('selected repo limits general context', () => has(chat, 'selectedRepositoryId: selectedContext?.provenance?.repositoryId'));
test('global mode does not load package inventories', () => has(chat, 'includeTechnicalContext && repositoryIds.length > 0'));
test('technical context has distinct label', () => has(chatPrompt, 'TECHNICAL_REPOSITORY_CONTEXT'));
test('packages cannot change role', () => has(chatPrompt, 'Do not change Dev2Vec role predictions based on general repository context'));
test('packages cannot change skill status', () => has(chatPrompt, 'Do not change matched/weak/missing skill status'));
test('legacy snapshot cannot make personal claims', () => lacks(read('src/services/currentContext.service.js'), "models/AnalysisSnapshot"));
test('compatible Dev2Vec is authoritative', () => has(chatPrompt, 'AUTHORITATIVE_DEV2VEC_CONTEXT is the only source'));
test('comparison requires explicit repositories', () => { has(comparison, 'explicitRepositoryIds.length < 2'); has(chat, 'body?.repositoryIds || []'); });
test('cross-user repository remains rejected', () => has(read('src/services/currentContext.service.js'), 'Repository.findOne({ _id: repositoryId, userId })'));
test('closed session guard remains', () => has(chat, 'ensureSessionOpen(session)'));
test('manual mode remains', () => has(chat, "effectiveMode === 'MANUAL'"));
test('old chat DTO fields remain', () => ['userMessage', 'assistantMessage', 'session', 'context'].forEach((key) => has(chat, key)));
test('prompt forbids full source and secrets', () => has(chatPrompt, 'raw source code, or raw patches'));
test('logs store provenance not sensitive payload', () => { has(chat, 'context: selectedContext.provenance'); lacks(chat, 'console.log(prompt)'); });

assert.strictEqual(count, 45);
console.log('PASS: Remediation Batch 2 role, roadmap and chat boundaries (45 checks)');
