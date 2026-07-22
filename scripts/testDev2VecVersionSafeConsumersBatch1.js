const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compatibility = require('../src/services/dev2vec/dev2vecCompatibility.service');
const { DEV2VEC_MODEL_VERSION } = require('../src/constants/dev2vecCatalog');

const current = compatibility.getCurrentDev2VecVersions();
const compatibleRecord = (overrides = {}) => ({
  analysisScope: { type: 'user_contribution' },
  dev2vec: {
    modelVersion: current.modelVersion,
    cacheMetadata: {
      modelVersion: current.modelVersion,
      modelArtifactVersion: current.modelVersion,
      analysisPipelineVersion: current.analysisPipelineVersion,
      repoDocumentVersion: current.repoDocumentVersion,
      issueDocumentVersion: current.issueDocumentVersion,
      apiEvidenceVersion: current.apiEvidenceVersion,
      evidenceBuilderVersion: current.evidenceBuilderVersion,
      mappingVersion: current.mappingVersion,
      cachePolicyVersion: current.cachePolicyVersion,
      consumerCompatibilityVersion: current.consumerCompatibilityVersion,
      roleSelectionVersion: current.roleSelectionVersion,
      aiContextBoundaryVersion: current.aiContextBoundaryVersion,
      roadmapSourceVersion: current.roadmapSourceVersion,
    },
  },
  ...overrides,
});
const mutateMetadata = (field, value) => {
  const record = compatibleRecord();
  if (field === 'modelVersion') record.dev2vec.modelVersion = value;
  else record.dev2vec.cacheMetadata[field] = value;
  return record;
};
let count = 0;
const test = (name, fn) => { fn(); count += 1; console.log(`PASS ${count}: ${name}`); };
const has = (source, value) => assert.ok(source.includes(value), `Expected source to include ${value}`);
const lacks = (source, value) => assert.ok(!source.includes(value), `Expected source not to include ${value}`);

const analysisSource = read('src/services/analysis.service.js');
const contextSource = read('src/services/currentContext.service.js');
const snapshotSource = read('src/services/snapshot.service.js');
const dashboardSource = read('src/services/dashboard.service.js');
const adminSource = read('src/services/admin.service.js');
const feedbackSource = read('src/services/aiFeedback.service.js');

test('current record accepted', () => assert.ok(compatibility.isCompatibleAnalysisResult(compatibleRecord())));
test('old pipeline rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(mutateMetadata('analysisPipelineVersion', 'dev2vec-analysis-pipeline-v10'))));
test('wrong model rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(mutateMetadata('modelVersion', 'dev2vec-demo-v3'))));
test('wrong repo document rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(mutateMetadata('repoDocumentVersion', 'old'))));
test('wrong issue document rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(mutateMetadata('issueDocumentVersion', 'old'))));
test('wrong API evidence rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(mutateMetadata('apiEvidenceVersion', 'old'))));
test('non-contribution scope rejected', () => assert.ok(!compatibility.isCompatibleAnalysisResult(compatibleRecord({ analysisScope: { type: 'repository' } }))));
test('compatible selector is version-filtered before timestamp sort', () => has(analysisSource, 'buildCompatibleAnalysisQuery'));
test('analysis result GET selects compatible record', () => has(analysisSource, "AnalysisResult.findOne(buildCompatibleAnalysisQuery"));
test('analysis me evaluates compatibility per repository', () => has(analysisSource, 'groupedByRepository'));
test('legacy-only analysis returns typed state', () => has(analysisSource, "reason: 'no_compatible_dev2vec_analysis'"));
test('analysis ownership query remains user/repository scoped', () => { has(analysisSource, 'userId: user.userId'); has(analysisSource, 'repositoryId: repository._id'); });
test('snapshot history mapper returns versions', () => has(snapshotSource, 'repoDocumentVersion: compatibility.repoDocumentVersion'));
test('snapshot detail uses version-aware mapper', () => has(snapshotSource, 'formatSnapshotResponse(snapshot'));
test('same-version snapshot comparison passes pure contract', () => assert.ok(compatibility.compareSnapshotVersions(compatibleRecord(), compatibleRecord()).compatible));
test('old/current snapshot comparison rejected', () => assert.ok(!compatibility.compareSnapshotVersions(mutateMetadata('analysisPipelineVersion', 'v8'), compatibleRecord()).compatible));
test('different document version rejected', () => assert.ok(!compatibility.compareSnapshotVersions(mutateMetadata('repoDocumentVersion', 'old'), compatibleRecord()).compatible));
test('same repository is enforced by comparison result', () => has(snapshotSource, 'Snapshots must belong to the same repository.'));
test('snapshot queries remain user scoped', () => has(snapshotSource, 'userId: user.userId'));
test('progress comparison selects compatible snapshots only', () => has(snapshotSource, 'RepoAnalysisSnapshot.find(buildCompatibleSnapshotQuery'));
test('insufficient compatible snapshots is typed', () => has(snapshotSource, "comparisonStatus: 'insufficient_compatible_snapshots'"));
test('incompatible pair throws before delta builder', () => assert.ok(snapshotSource.indexOf('if (!versionComparison.compatible)') < snapshotSource.indexOf('data: buildComparisonResult(fromSnapshot')));
test('dashboard uses rank-one prediction', () => has(dashboardSource, 'predictions[0]?.roleName'));
test('dashboard uses Python gap fields', () => { has(dashboardSource, 'gap.matchedSkillNames'); has(dashboardSource, 'gap.missingSkillNames'); });
test('dashboard does not import legacy analysis snapshot', () => lacks(dashboardSource, "models/AnalysisSnapshot"));
test('dashboard requires active roadmap', () => has(dashboardSource, "status: 'active'"));
test('dashboard reads RoadmapProgress', () => has(dashboardSource, 'RoadmapProgress.findOne'));
test('dashboard exposes analysis-required state', () => has(dashboardSource, "'analysis_required'"));
test('dashboard legacy response keys remain', () => ['repositories', 'skills', 'suggestedCareerPath', 'roadmapProgress', 'latestAnalysisAt'].forEach((key) => has(dashboardSource, key)));
test('admin analysis uses AnalysisResult', () => has(adminSource, 'model: AnalysisResult'));
test('admin labels incompatible analysis', () => has(adminSource, 'isCompatible: compatibility.isCompatible'));
test('admin analysis removes vectors and raw documents', () => { has(adminSource, 'rawAnalysis: undefined'); lacks(adminSource, 'repoVector: dev2vec.repoVector'); });
test('admin response envelope remains', () => { has(adminSource, "message: 'Analysis fetched successfully'"); has(adminSource, 'data: { analysis:'); });
test('feedback generation uses current context only', () => { has(feedbackSource, "sourceType: 'AnalysisResult'"); lacks(feedbackSource, "sourceType: selectedContext.legacyFallback"); });
test('current context has no legacy snapshot fallback', () => lacks(contextSource, "models/AnalysisSnapshot"));
test('feedback stale when analysis changes', () => has(feedbackSource, "staleReason: 'analysis_changed'"));
test('feedback me evaluates stale semantics', () => has(feedbackSource, 'await evaluateFeedbackCompatibility(userId, feedback)'));
test('admin feedback exposes compatibility semantics', () => has(adminSource, 'evaluateFeedbackCompatibility'));
test('feedback preserves old fields and adds versions', () => ['careerDirection', 'nextSteps', 'sourceModelVersion', 'currentPipelineVersion'].forEach((key) => has(feedbackSource, key)));
test('role catalog reports v4', () => assert.strictEqual(DEV2VEC_MODEL_VERSION, 'dev2vec-demo-v4'));

assert.strictEqual(count, 40);
console.log('PASS: Remediation Batch 1 version-safe consumers (40 checks)');
