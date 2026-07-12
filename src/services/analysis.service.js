const AnalysisResult = require('../models/AnalysisResult');
const RepositoryPackage = require('../models/RepositoryPackage');
const RepositoryCommit = require('../models/RepositoryCommit');
const GithubAccount = require('../models/GithubAccount');

const { findRepositoryForUser } = require('./github/github.repository.service');
const {
  filterUserContributionCommits,
  sanitizeAnalysisSnapshot,
} = require('./analysis/analysis.engine');
const { createSnapshotFromAnalysisResult } = require('./snapshot.service');
const { createStatusError } = require('./github/github.utils');
const { resolveUserContributionSource } = require('./analysisSource.service');
const { fetchRepositoryPackages } = require('./github/github.package.service');
const { getRepositoryIssueEvidence } = require('./github/github.issue.service');
const {
  fetchAndCacheRepositoryCommits,
  fetchAndCacheCommitDetailsForUserCommits,
} = require('./github/github.commit.service');
const {
  buildDev2VecInputFromAnalysisSource,
  buildDev2VecInputFromRepositoryAnalysis,
} = require('./dev2vec/dev2vecInputBuilder.service');
const { runDev2VecInference } = require('./dev2vec/dev2vec.service');
const {
  getCurrentDev2VecPipelineMetadata,
} = require('./dev2vec/dev2vecPipelineMetadata.service');
const {
  getRepositoryFingerprint,
  hasCachedDev2VecResult,
  shouldUseCachedDev2Vec,
} = require('./dev2vec/dev2vecCachePolicy.service');
const {
  buildAnalysisSkillsFromDev2Vec,
  buildAnalysisSummaryFromDev2Vec,
  mapDev2VecOutputToRoleMatches,
} = require('./dev2vec/dev2vecRoleMapper.service');
const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
  normalizeSkillText,
} = require('../utils/skillCanonicalizer');
const { buildDocumentationRecommendation } = require('../utils/documentationEvidence');
const { createDev2VecTimer } = require('../utils/dev2vecTiming');
const { resolveEffectiveRole, roleKey } = require('./analysis/effectiveRoleResolver');

const shouldIncludeEvidence = (query = {}) => query.includeEvidence === true || query.includeEvidence === 'true';
const getView = (query = {}) => (query.view === 'detail' ? 'detail' : 'summary');
const isDev2VecDebugEnabled = () => process.env.DEV2VEC_DEBUG === 'true' || process.env.DEV2VEC_DEBUG === '1';
const isAnalysisRoleDebugEnabled = () => process.env.ANALYSIS_ROLE_DEBUG === 'true' || process.env.ANALYSIS_ROLE_DEBUG === '1';
const isContributionCodeDebugEnabled = () => process.env.ANALYSIS_CONTRIBUTION_CODE_DEBUG === 'true' || process.env.ANALYSIS_CONTRIBUTION_CODE_DEBUG === '1';
const isAnalysisSkillDebugEnabled = () => process.env.ANALYSIS_SKILL_DEBUG === 'true' || process.env.ANALYSIS_SKILL_DEBUG === '1';

const logDev2VecDebug = (event, details = {}) => {
  if (!isDev2VecDebugEnabled()) return;
  console.log('[dev2vec][debug]', event, {
    repoId: details.repoId ? String(details.repoId) : undefined,
    analysisId: details.analysisId ? String(details.analysisId) : undefined,
    cacheHit: details.cacheHit,
    cacheReason: details.cacheReason,
    forceRegenerate: details.forceRegenerate,
    pipelineVersion: details.pipelineVersion,
    modelArtifactVersion: details.modelArtifactVersion,
    scoringVersion: details.scoringVersion,
    availableChannels: details.availableChannels,
    issueStatus: details.issueStatus,
    repoTokenCount: details.repoTokenCount,
    apiTokenCount: details.apiTokenCount,
    issueTokenCount: details.issueTokenCount,
    sourceFileCount: details.sourceFileCount,
    skippedFileCount: details.skippedFileCount,
    inferenceDurationMs: details.inferenceDurationMs,
    topRoles: details.topRoles,
  });
};

const validateAuthUser = (authUser) => {
  if (!authUser || !authUser.userId) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }
};

const roundVector = (vector = []) => (
  Array.isArray(vector)
    ? vector.map((value) => Math.round((Number(value) || 0) * 10000) / 10000)
    : []
);

const dateOrNull = (value) => (value ? new Date(value) : null);

const buildCommitSummary = (commits = []) => {
  const dates = commits
    .map((commit) => dateOrNull(commit.authorDate || commit.committerDate))
    .filter((date) => date && !Number.isNaN(date.getTime()))
    .sort((left, right) => left - right);
  const activeDays = new Set(dates.map((date) => date.toISOString().slice(0, 10))).size;

  return {
    totalCommits: commits.length,
    activeDays,
    vagueCommitRatio: 0,
    conventionalCommitRatio: 0,
    firstCommitDate: dates[0] || null,
    lastCommitDate: dates[dates.length - 1] || null,
  };
};

const stringArray = (values) => (
  Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : []
);

const uniqueStrings = (values = [], limit = 20) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
};

const buildDev2VecStrengths = (dev2vecInput = {}) => {
  const sourceStats = dev2vecInput.sourceStats || {};
  return [
    `H\u1ec7 th\u1ed1ng \u0111\u00e3 ph\u00e2n t\u00edch ${Number(sourceStats.commitCount || 0)} commits, ${Number(sourceStats.apiTokenCount || 0)} API/dependency tokens v\u00e0 ${Number(sourceStats.sourceFileCount || 0)} source files b\u1eb1ng Dev2Vec.`,
  ];
};

const buildDev2VecWeaknesses = (skillMapping = {}) => (
  [
    ...(skillMapping.weaknesses || []).map((item) => (
      item && typeof item === 'object' ? item : { canonicalSkillName: item }
    )),
    ...(skillMapping.missingSkills || []),
  ]
    .reduce((items, item) => {
      const skillName = item.canonicalSkillName || item.skill || item;
      const key = String(skillName || '').toLowerCase();
      if (!key || items.some((existing) => String(existing.skillName || '').toLowerCase() === key) || items.length >= 10) {
        return items;
      }
      items.push({ ...item, skillName });
      return items;
    }, [])
    .map((item) => (
      item.evidenceDetected || item.evidenceStatus === 'detected_but_low_similarity'
        ? `\u0110\u00e3 th\u1ea5y evidence v\u1ec1 ${item.skillName} trong source code, nh\u01b0ng Dev2Vec similarity hi\u1ec7n c\u00f2n th\u1ea5p. B\u1ea1n n\u00ean l\u00e0m r\u00f5 h\u01a1n b\u1eb1ng docs/tests/validation.`
        : `Ch\u01b0a th\u1ea5y \u0111\u1ee7 evidence r\u00f5 v\u1ec1 ${item.skillName} trong d\u1eef li\u1ec7u ph\u00e2n t\u00edch hi\u1ec7n t\u1ea1i.`
    ))
);

const SKILL_EVIDENCE_EXAMPLES = {
  'REST API': 'route, controller, validation, error handling v\u00e0 API docs',
  Database: 'schema, model, query, indexing v\u00e0 transaction n\u1ebfu c\u1ea7n',
  Authentication: 'JWT, middleware, RBAC, refresh token v\u00e0 protected routes',
  'Docker Basics': 'Dockerfile t\u1ed1i \u01b0u, docker-compose, healthcheck v\u00e0 h\u01b0\u1edbng d\u1eabn ch\u1ea1y',
  'API Testing': 'Jest/Supertest, integration tests v\u00e0 test script',
};

const SKILL_RECOMMENDATIONS = {
  'REST API': 'B\u1ea1n n\u00ean b\u1ed5 sung ho\u1eb7c l\u00e0m r\u00f5 route/controller, validation, error handling v\u00e0 API docs.',
  Database: 'B\u1ea1n n\u00ean l\u00e0m r\u00f5 schema, model, query, indexing v\u00e0 transaction n\u1ebfu c\u1ea7n.',
  Authentication: 'B\u1ea1n n\u00ean l\u00e0m r\u00f5 JWT, middleware, RBAC, refresh token v\u00e0 protected routes.',
  'Docker Basics': 'B\u1ea1n n\u00ean b\u1ed5 sung healthcheck, bi\u1ebfn m\u00f4i tr\u01b0\u1eddng production v\u00e0 h\u01b0\u1edbng d\u1eabn ch\u1ea1y Docker.',
  'API Testing': 'B\u1ea1n n\u00ean b\u1ed5 sung Jest/Supertest, integration tests v\u00e0 npm test script.',
};

const buildDev2VecRecommendations = (skillMapping = {}) => {
  const items = [
    ...(skillMapping.missingSkills || []),
    ...(skillMapping.recommendations || []).map((skillName) => ({ canonicalSkillName: skillName })),
  ];
  const seen = new Set();
  const recommendations = [];

  for (const item of items) {
    const skillName = item.canonicalSkillName || item.skill || item;
    const key = String(skillName || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    recommendations.push(SKILL_RECOMMENDATIONS[skillName] || (
      item.evidenceStatus === 'detected_but_low_similarity'
        ? `B\u1ea1n n\u00ean th\u1ec3 hi\u1ec7n r\u00f5 h\u01a1n ${skillName} qua ${SKILL_EVIDENCE_EXAMPLES[skillName] || 'source code, t\u00e0i li\u1ec7u v\u00e0 v\u00ed d\u1ee5 s\u1eed d\u1ee5ng'}.`
        : `B\u1ea1n n\u00ean b\u1ed5 sung ${skillName} v\u00e0o d\u1ef1 \u00e1n.`
    ));

    if (recommendations.length >= 10) break;
  }

  return recommendations;
};
const buildSkillVectorFromDev2VecSkills = ({ topSkills = [], missingSkills = [] }) => {
  const now = new Date();
  const entries = [];
  const toSkillScore100 = (value, fallback = 0) => {
    const numeric = Number.isFinite(Number(value)) ? Number(value) : Number(fallback || 0);
    const scaled = numeric <= 1 ? numeric * 100 : numeric;
    return Math.min(100, Math.max(0, Math.round(scaled * 100) / 100));
  };

  for (const item of topSkills) {
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    entries.push({
      skill: canonicalSkillName,
      canonicalSkillName,
      normalizedSkillName: normalizeSkillText(canonicalSkillName),
      category: item.category || getCanonicalSkillCategory(canonicalSkillName),
      score: toSkillScore100(item.score),
      level: item.level || (item.level === 'strong' ? 'strong' : 'developing'),
      similarity: item.similarity,
      dev2vecStatus: item.dev2vecStatus,
      evidenceDetected: item.evidenceDetected,
      evidenceStatus: item.evidenceStatus,
      reason: item.reason,
      evidence: item.evidence?.length ? item.evidence : ['Dev2Vec matched skill prototype'],
      sources: item.evidence?.length ? ['dev2vec', 'source_evidence'] : ['dev2vec'],
      lastCalculatedAt: now,
    });
  }

  for (const item of missingSkills) {
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;
    const key = canonicalSkillName.toLowerCase();
    if (entries.some((entry) => entry.canonicalSkillName.toLowerCase() === key)) continue;
    entries.push({
      skill: canonicalSkillName,
      canonicalSkillName,
      normalizedSkillName: normalizeSkillText(canonicalSkillName),
      category: item.category || getCanonicalSkillCategory(canonicalSkillName),
      score: toSkillScore100(item.score, 0),
      level: item.level || (item.priority === 'medium' ? 'weak' : 'missing'),
      similarity: item.similarity,
      dev2vecStatus: item.dev2vecStatus,
      evidenceDetected: item.evidenceDetected,
      evidenceStatus: item.evidenceStatus,
      reason: item.reason,
      evidence: item.evidence?.length ? item.evidence : ['Dev2Vec skill gap prototype'],
      sources: item.evidenceStatus === 'detected_but_low_similarity' ? ['dev2vec', 'source_evidence'] : ['dev2vec'],
      lastCalculatedAt: now,
    });
  }

  return entries;
};

const createDev2VecStatusError = (error) => {
  const statusError = createStatusError(error.message || 'Dev2Vec inference failed', error.statusCode || 503);
  statusError.errorCode = error.errorCode || 'DEV2VEC_INFERENCE_FAILED';
  return statusError;
};

const buildDev2VecAnalysisPayload = ({
  repository,
  packageRecord,
  commits,
  contributionScope,
  githubAccount,
  dev2vecInput,
  dev2vecOutput,
  issueEvidence,
}) => {
  let summary = buildAnalysisSummaryFromDev2Vec(dev2vecOutput);
  const repoFeatureEvidence = dev2vecInput.repoFeatureEvidence || dev2vecInput.evidencePreview?.repoFeatures || {};
  const hasDetectedRepoFeature = Object.values(repoFeatureEvidence)
    .some((feature) => feature && feature.detected === true);
  const hasAnyTechnicalEvidence = Boolean(
    Number(dev2vecInput.sourceStats?.sourceFileCount || 0) > 0
    || Number(dev2vecInput.sourceStats?.apiTokenCount || 0) > 0
    || Number(dev2vecInput.sourceStats?.userContributionFileCount || 0) > 0
    || hasDetectedRepoFeature
  );
  const repositoryProjectType = inferProjectTypeFromRepositoryContext(dev2vecInput, summary.projectType);
  if (repositoryProjectType) summary.projectType = repositoryProjectType;
  const contributionCareerDirection = inferCareerDirectionFromUserContribution(dev2vecInput, summary.projectType);
  const contributionKey = roleKey(contributionCareerDirection);
  const contributionCounts = {
    frontend: Number(dev2vecInput.sourceStats?.userContributionFrontendFileCount || 0),
    backend: Number(dev2vecInput.sourceStats?.userContributionBackendFileCount || 0),
    mobile: Number(dev2vecInput.sourceStats?.userContributionMobileFileCount || 0),
    devops: Number(dev2vecInput.sourceStats?.userContributionDevopsFileCount || 0),
    data: Number(dev2vecInput.sourceStats?.userContributionDataFileCount || 0),
  };
  const effectiveRole = hasAnyTechnicalEvidence
    ? resolveEffectiveRole({
      repositoryRole: summary.projectType,
      userContributionRole: contributionCareerDirection,
      classifierRole: summary.careerDirection,
      classifierConfidence: Number(dev2vecOutput.rolePredictions?.[0]?.probability || 0),
      userContributionEvidence: {
        topFileCount: contributionCounts[contributionKey] || 0,
        competingFileCount: Math.max(0, ...Object.entries(contributionCounts)
          .filter(([key]) => key !== contributionKey)
          .map(([, count]) => count)),
      },
    })
    : {
      effectiveRoleId: '',
      effectiveRoleName: '',
      reason: 'insufficient_technical_evidence',
      source: 'none',
      confidenceSource: 'none',
    };
  const repositoryRole = summary.projectType;
  const classifierRole = dev2vecOutput.rolePredictions?.[0]?.roleName || summary.careerDirection;
  const effectiveSummary = hasAnyTechnicalEvidence
    ? buildAnalysisSummaryFromDev2Vec(dev2vecOutput, { roleId: effectiveRole.effectiveRoleId })
    : buildAnalysisSummaryFromDev2Vec({}, { roleId: '' });
  const effectiveProjectType = effectiveSummary.projectType || repositoryRole;
  const finalProjectType = !hasAnyTechnicalEvidence
    ? ''
    : effectiveRole.reason === 'strong_changed_file_evidence_overrides_low_confidence_classifier'
      ? effectiveProjectType
      : repositoryRole;
  summary = {
    ...effectiveSummary,
    projectType: finalProjectType,
    careerDirection: effectiveRole.effectiveRoleName || effectiveSummary.careerDirection,
  };
  const skillMapping = buildAnalysisSkillsFromDev2Vec({
    ...dev2vecOutput,
    repoFeatureEvidence,
  }, {
    repoFeatureEvidence,
    roleId: effectiveRole.effectiveRoleId,
    commits,
  });
  if (isAnalysisRoleDebugEnabled()) {
    console.log('[analysis-role][debug]', {
      repositoryRole,
      repositoryRoleConfidence: null,
      userContributionRole: contributionCareerDirection || 'unknown',
      frontendChangedFileCount: contributionCounts.frontend,
      backendChangedFileCount: contributionCounts.backend,
      mobileChangedFileCount: contributionCounts.mobile,
      devopsChangedFileCount: contributionCounts.devops,
      dataChangedFileCount: contributionCounts.data,
      classifierRole,
      classifierConfidence: Number(dev2vecOutput.rolePredictions?.[0]?.probability || 0),
      classifierProbabilities: (dev2vecOutput.rolePredictions || []).map((prediction) => ({
        roleId: prediction.roleId,
        probability: prediction.probability,
      })),
      effectiveRole: effectiveRole.effectiveRoleName,
      effectiveRoleReason: effectiveRole.reason,
      roleCatalogLookupKey: effectiveRole.effectiveRoleId,
      selectedSkillGapRole: effectiveRole.effectiveRoleId,
      responseCareerDirection: summary.careerDirection,
      responseProjectType: summary.projectType,
    });
  }
  if (isAnalysisSkillDebugEnabled()) {
    const debug = skillMapping.debug || {};
    const evidenceSourceCounts = (commits || [])
      .flatMap((commit) => Array.isArray(commit.normalizedFiles) ? commit.normalizedFiles : [])
      .reduce((counts, file) => {
        const key = file.evidenceSource || 'unknown';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {});
    const normalizedSignals = (commits || [])
      .flatMap((commit) => Array.isArray(commit.normalizedFiles) ? commit.normalizedFiles : [])
      .reduce((signals, file) => {
        [
          ...(file.detectedFrameworks || []),
          ...(file.detectedLibraries || []),
          ...(file.detectedPatterns || []),
          ...(file.detectedRoleSignals || []),
          ...(file.skillSignals || []),
        ].forEach((signal) => {
          const value = String(signal || '').trim();
          if (value) signals.add(value);
        });
        return signals;
      }, new Set());
    console.log('[analysis-skill][debug]', {
      flowVersion: getCurrentDev2VecPipelineMetadata().analysisPipelineVersion,
      evidenceVersion: (commits || []).flatMap((commit) => commit.normalizedFiles || [])[0]?.evidenceVersion || '',
      skillMappingVersion: debug.skillMappingVersion || '',
      effectiveRole: effectiveRole.effectiveRoleName,
      roleCatalogKey: effectiveRole.effectiveRoleId,
      sourceFetchStatus: hasAnyTechnicalEvidence ? 'available' : 'unavailable',
      sourceFileCount: Number(dev2vecInput.sourceStats?.sourceFileCount || 0),
      apiTokenCount: Number(dev2vecInput.sourceStats?.apiTokenCount || 0),
      matchedCommitCount: Array.isArray(commits) ? commits.length : 0,
      evidenceRecordCount: Number(debug.evidenceRecordCount || 0),
      evidenceSourceCounts,
      normalizedSignals: [...normalizedSignals].sort(),
      canonicalSkills: debug.canonicalSkills || [],
      finalTopSkills: (skillMapping.topSkills || []).map((item) => item.canonicalSkillName),
      finalMissingSkills: (skillMapping.missingSkills || []).map((item) => item.canonicalSkillName),
    });
  }
  const skillVector = buildSkillVectorFromDev2VecSkills(skillMapping);
  const commitSummary = buildCommitSummary(commits);
  const packages = uniqueStrings([
    ...stringArray(packageRecord?.packages),
    ...dev2vecInput.apiTokens,
  ], 100);
  const frameworks = uniqueStrings(stringArray(packageRecord?.frameworks), 50);
  const languages = uniqueStrings([
    repository.language,
    ...stringArray(repository.languages),
    ...stringArray(packageRecord?.languages),
  ], 50);
  const configs = uniqueStrings([
    ...stringArray(packageRecord?.configs),
    ...stringArray(packageRecord?.packageFiles),
  ], 50);
  const topProbability = Number(dev2vecOutput.rolePredictions?.[0]?.probability || 0);
  const docsEvidence = dev2vecInput.evidencePreview?.docs || {};
  const docsRecommendation = buildDocumentationRecommendation(docsEvidence);
  const cacheMetadata = {
    ...getCurrentDev2VecPipelineMetadata(),
    repositoryFingerprint: getRepositoryFingerprint(repository),
  };
  const recommendations = buildDev2VecRecommendations(skillMapping);
  if (
    docsRecommendation
    && docsEvidence.documentationStatus !== 'no_markdown_docs'
    && !recommendations.includes(docsRecommendation)
  ) {
    recommendations.push(docsRecommendation);
  }
  const hasReadme = Boolean(
    docsEvidence.readmeRootExists
    || repository.readme
    || repository.readmeContent
    || repository.contentPreview
  );

  return {
    githubRepoId: repository.githubRepoId,
    repoName: repository.name || repository.repoName || '',
    fullName: repository.fullName || '',
    analyzedAt: new Date(),
    projectType: summary.projectType || 'Unknown',
    languages,
    frameworks,
    packages,
    configs,
    skillSignals: skillMapping.topSkills.map((item) => item.canonicalSkillName),
    careerSignals: [summary.careerDirection].filter(Boolean),
    careerDirection: summary.careerDirection || 'Generalist Software Engineer',
    strengths: buildDev2VecStrengths(dev2vecInput),
    weaknesses: buildDev2VecWeaknesses(skillMapping),
    missingSkills: uniqueStrings(skillMapping.missingSkills.map((item) => item.canonicalSkillName), 20),
    recommendations,
    scores: {
      techStackScore: summary.overallScore,
      documentationScore: hasReadme || Number(docsEvidence.markdownFileCount || 0) > 0 ? 70 : 0,
      commitQualityScore: 0,
      deploymentScore: 0,
      testingScore: 0,
      portfolioReadinessScore: summary.overallScore,
      overallScore: summary.overallScore,
    },
    summary,
    analysisScope: {
      type: 'user_contribution',
      githubUsername: githubAccount?.username || '',
      totalRepoCommits: Number(contributionScope?.totalRepoCommits || commits.length),
      userCommits: commits.length,
      activeDays: commitSummary.activeDays,
      firstCommitDate: commitSummary.firstCommitDate,
      lastCommitDate: commitSummary.lastCommitDate,
      analyzedCommitShas: commits.map((commit) => commit.sha).filter(Boolean),
      source: 'dev2vec',
    },
    scoreBreakdown: {
      scoringMethod: 'dev2vec_doc2vec_classifier',
      modelVersion: dev2vecOutput.modelVersion || null,
      topRoleProbability: topProbability,
      vectorSources: dev2vecOutput.vectorSources || {},
      sourceStats: {
        ...dev2vecInput.sourceStats,
        ...(dev2vecOutput.sourceStats || {}),
      },
      repoFeatureEvidence,
      skillScore: summary.overallScore,
      contributionScore: 0,
      commitQualityScore: 0,
      projectCompletenessScore: 0,
      missingCriticalPenalty: 0,
      confidence: topProbability,
    },
    commitSummary,
    checklist: {
      hasReadme,
      hasEnvExample: configs.some((item) => item.toLowerCase().includes('.env.example')),
      hasDocker: configs.some((item) => item.toLowerCase().includes('dockerfile') || item.toLowerCase().includes('docker')),
      hasDockerCompose: configs.some((item) => item.toLowerCase().includes('docker-compose')),
      hasCICD: configs.some((item) => item.toLowerCase().includes('.github/workflows')),
      hasTesting: packages.some((item) => /jest|vitest|mocha|pytest|junit|playwright|cypress/i.test(item)),
      hasLinting: packages.some((item) => /eslint|ruff|pylint/i.test(item)),
      hasFormatter: packages.some((item) => /prettier|black|formatter/i.test(item)),
      hasPackageFile: Boolean(dev2vecInput.sourceStats.packageFileCount),
    },
    rawAnalysis: {
      scoringMethod: 'dev2vec_doc2vec_classifier',
      requestId: dev2vecInput.requestId,
      evidenceChannels: dev2vecInput.evidenceChannels || {},
      pipelineMetadata: cacheMetadata,
      dev2vecCacheMetadata: cacheMetadata,
      issueEvidence: {
        metadata: issueEvidence?.metadata || {},
        issues: Array.isArray(issueEvidence?.issues) ? issueEvidence.issues : [],
      },
    },
    skillEvidence: [],
    skillVector,
    dev2vec: {
      modelVersion: dev2vecOutput.modelVersion || null,
      vectorDims: dev2vecOutput.vectorDims || {},
      repoVector: roundVector(dev2vecOutput.vectors?.repoVector),
      issueVector: roundVector(dev2vecOutput.vectors?.issueVector),
      apiVector: roundVector(dev2vecOutput.vectors?.apiVector),
      combinedVector: roundVector(dev2vecOutput.vectors?.combinedVector),
      vectorSources: dev2vecOutput.vectorSources || {},
      sourceStats: {
        ...dev2vecInput.sourceStats,
        ...(dev2vecOutput.sourceStats || {}),
      },
      repoFeatureEvidence,
      evidencePreview: dev2vecInput.evidencePreview || {},
      rolePredictions: dev2vecOutput.rolePredictions || [],
      skillGaps: dev2vecOutput.skillGaps || {},
      scoringMethod: 'dev2vec_doc2vec_classifier',
      cacheMetadata,
    },
  };
};

const unwrapSettled = (result, fallback = null) => (
  result && result.status === 'fulfilled' ? result.value : fallback
);

const getCommitBranch = (repository = {}) => String(repository.defaultBranch || repository.rawData?.default_branch || 'main').trim();

const inferProjectTypeFromRepositoryContext = (dev2vecInput = {}, fallback = '') => {
  const stats = dev2vecInput.sourceStats || {};
  const features = dev2vecInput.repoFeatureEvidence || {};
  const detected = (name) => features[name]?.detected === true;
  const frontendScore = Number(stats.frontendFileCount || 0)
    + (detected('Frontend') ? 4 : 0)
    + (dev2vecInput.apiTokens || []).filter((token) => /^(react|react-dom|react-router|react-router-dom|vite|tailwindcss|next|vue|angular|svelte)$/.test(token)).length;
  const backendScore = Number(stats.backendFileCount || 0)
    + Number(stats.restApiFileCount || 0)
    + Number(stats.databaseFileCount || 0)
    + (detected('Backend') ? 4 : 0)
    + (detected('REST API') ? 3 : 0)
    + (detected('Database') ? 2 : 0);
  const mobileScore = Number(stats.mobileFileCount || 0) + (detected('Mobile') ? 4 : 0);
  const devopsScore = Number(stats.devopsFileCount || 0) + (detected('DevOps') ? 4 : 0);
  const dataScore = Number(stats.dataFileCount || 0) + (detected('Data Science') ? 4 : 0);
  const scores = [
    ['Frontend', frontendScore],
    ['Backend', backendScore],
    ['Mobile', mobileScore],
    ['DevOps', devopsScore],
    ['Data Science', dataScore],
  ].sort((left, right) => right[1] - left[1]);

  if (!scores[0] || scores[0][1] <= 0) return fallback;
  if (scores[0][1] >= scores[1][1] + 2) return scores[0][0];
  return fallback;
};

const inferCareerDirectionFromUserContribution = (dev2vecInput = {}, projectType = '') => {
  const stats = dev2vecInput.sourceStats || {};
  const roles = [
    ['Frontend Developer', Number(stats.userContributionFrontendFileCount || 0), 'Frontend'],
    ['Backend Developer', Number(stats.userContributionBackendFileCount || 0), 'Backend'],
    ['Mobile Developer', Number(stats.userContributionMobileFileCount || 0), 'Mobile'],
    ['DevOps Engineer', Number(stats.userContributionDevopsFileCount || 0), 'DevOps'],
    ['Data Scientist', Number(stats.userContributionDataFileCount || 0), 'Data Science'],
  ].sort((left, right) => right[1] - left[1]);
  const top = roles[0];
  const second = roles[1];
  if (!top || top[1] < 2 || top[1] < second[1] + 2) return '';
  return top[0];
};

const loadRepositoryCommitsForAnalysis = async ({ user, repository, githubAccount, existingCommits = [] }) => {
  const branch = getCommitBranch(repository);
  const branchCommits = (Array.isArray(existingCommits) ? existingCommits : [])
    .filter((commit) => !commit.branch || commit.branch === branch);
  const cacheFresh = branchCommits.some((commit) => (
    commit.lastFetchedAt
    && Date.now() - new Date(commit.lastFetchedAt).getTime() < 15 * 60 * 1000
  ));
  if (branchCommits.length && cacheFresh) {
    return { commits: branchCommits, metadata: { source: 'cache', branch } };
  }

  const result = await fetchAndCacheRepositoryCommits({
    authUser: user,
    repository,
    githubAccount,
    query: { sha: branch, perPage: 100 },
    forceRefresh: branchCommits.length === 0,
  });
  return { commits: result.commits || branchCommits, metadata: result.metadata || { branch } };
};

const analyzeRepository = async ({ user, params, query }) => {
  validateAuthUser(user);
  if (isAnalysisRoleDebugEnabled()) {
    const metadata = getCurrentDev2VecPipelineMetadata();
    console.log('[analysis-role][debug] flow-version', {
      functionName: 'analysis.service.analyzeRepository',
      analysisPipelineVersion: metadata.analysisPipelineVersion,
      roleResolverVersion: metadata.roleResolverVersion,
    });
  }
  const timer = createDev2VecTimer({
    repoId: params.repoId,
    requestId: `analysis-${user.userId}-${params.repoId}`,
  });

  const repository = await timer.measure('metadataMs', () => findRepositoryForUser(user, params.repoId));
  let [githubAccount, packageRecord, cachedCommits] = await timer.measure('loadRepositoryContextMs', () => Promise.all([
    GithubAccount.findOne({ userId: user.userId }).lean(),
    RepositoryPackage.findOne({ userId: user.userId, repositoryId: repository._id }).lean(),
    RepositoryCommit.find({ userId: user.userId, repositoryId: repository._id }).sort({ authorDate: -1 }).lean(),
  ]));

  if (!githubAccount) {
    const error = new Error('GitHub account is not connected');
    error.statusCode = 400;
    throw error;
  }

  const commitLoad = await timer.measure('commitFetchMs', () => loadRepositoryCommitsForAnalysis({
    user,
    repository,
    githubAccount,
    existingCommits: cachedCommits,
  }));
  const commits = commitLoad.commits || [];
  const contributionScope = filterUserContributionCommits(commits, githubAccount);
  let userCommits = contributionScope.userCommits;
  const commitDetailLoad = await timer.measure('commitDetailFetchMs', () => fetchAndCacheCommitDetailsForUserCommits({
    authUser: user,
    repository,
    githubAccount,
    commits: userCommits,
    forceRefresh: false,
    includeCodeEvidence: true,
  }));
  userCommits = commitDetailLoad.commits || userCommits;
  if (isContributionCodeDebugEnabled() || isAnalysisSkillDebugEnabled()) {
    const code = commitDetailLoad.metadata?.codeEvidence || {};
    console.log('[analysis-contribution-code][debug]', {
      matchedUserCommitCount: userCommits.length,
      commitDetailsFetched: Number(commitDetailLoad.metadata?.fetchedDetailCount || 0),
      totalCommitFiles: Number(code.eligibleFiles || 0) + Number(code.ignoredFiles || 0),
      ignoredFiles: Number(code.ignoredFiles || 0),
      eligibleFiles: Number(code.eligibleFiles || 0),
      selectedFiles: Number(code.selectedFiles || 0),
      filesConsidered: Number(code.filesConsidered || 0),
      patchFilesParsed: Number(code.patchFilesParsed || code.patchFilesUsed || 0),
      fullFilesFetched: Number(code.fullFilesFetched || 0),
      pathOnlyFiles: Number(code.pathOnlyFiles || 0),
      skippedLargeFiles: Number(code.skippedLargeFiles || 0),
      timedOutFiles: Number(code.timedOutFiles || 0),
      normalizedFilesSaved: Number(code.normalizedFilesSaved || 0),
      totalPatchChars: Number(code.totalPatchChars || 0),
      totalContentBytes: Number(code.totalContentBytes || 0),
      countLimitApplied: Boolean(code.countLimitApplied),
      groupCounts: code.groupCounts || {},
      cacheHits: Number(commitDetailLoad.metadata?.reusedDetailCount || 0),
      cacheMisses: Number(commitDetailLoad.metadata?.fetchedDetailCount || 0),
    });
  }
  if (isAnalysisRoleDebugEnabled()) {
    const fileCount = (items) => items.reduce((sum, commit) => sum + (Array.isArray(commit.files) ? commit.files.length : 0), 0);
    console.log('[analysis-role][debug] commit-flow', {
      loadedCommitCount: commits.length,
      commitsWithDetailStatusAvailable: commits.filter((commit) => ['available', 'success'].includes(commit.detailStatus)).length,
      commitsWithFilesArray: commits.filter((commit) => Array.isArray(commit.files) && commit.files.length > 0).length,
      totalLoadedChangedFiles: fileCount(commits),
      sampleChangedPaths: commits.flatMap((commit) => (commit.files || []).map((file) => file.filename || file.path)).filter(Boolean).slice(0, 10),
      allCommitsWithFiles: commits.filter((commit) => commit.files?.length).length,
      matchedUserCommits: userCommits.length,
      matchedUserCommitsWithFiles: userCommits.filter((commit) => commit.files?.length).length,
      matchedTotalFiles: fileCount(userCommits),
    });
  }
  const [packageResult, issueResult] = await Promise.allSettled([
    timer.measure('packageSourceMs', () => ensurePackageSourceEvidence({
      user,
      repoId: params.repoId,
      repository,
      packageRecord,
    })),
    timer.measure('issueMs', () => getRepositoryIssueEvidence({
      user,
      repository,
      repoId: params.repoId,
    })),
  ]);
  packageRecord = unwrapSettled(packageResult, packageRecord);
  const issueEvidence = unwrapSettled(issueResult, {
    issues: [],
    metadata: { attempted: true, succeeded: false, unavailable: true, errorCode: 'ISSUE_EVIDENCE_UNAVAILABLE' },
  });

  const dev2vecInput = await timer.measure('inputBuilderMs', () => Promise.resolve(buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages: packageRecord ? [packageRecord] : [],
    commits: userCommits,
    issues: getModelIssues(issueEvidence),
    channelStatus: {
      issue: getIssueChannelStatus(issueEvidence),
    },
    // Keep every catalog role available internally so an evidence-selected
    // effective role always has its own classifier-generated skill gap.
    topN: 5,
    requestId: `analysis-${user.userId}-${repository._id}-${Date.now()}`,
  })));
  if (isAnalysisRoleDebugEnabled()) {
    console.log('[analysis-role][debug] top-n-input', {
      requestedTopN: 5,
      builderTopN: dev2vecInput.topN,
    });
  }

  let dev2vecOutput;
  try {
    dev2vecOutput = await timer.measure('inferenceTotalMs', () => runDev2VecInference(dev2vecInput));
    if (isAnalysisRoleDebugEnabled()) {
      console.log('[analysis-role][debug] top-n-output', {
        inferenceTopN: dev2vecInput.topN,
        returnedPredictionCount: dev2vecOutput.rolePredictions?.length || 0,
        returnedRoleIds: (dev2vecOutput.rolePredictions || []).map((prediction) => prediction.roleId),
      });
    }
  } catch (error) {
    console.error('[dev2vec] analysis inference failed:', {
      errorCode: error.errorCode,
      message: error.message,
      repositoryId: String(repository._id),
      userId: String(user.userId),
    });
    throw createDev2VecStatusError(error);
  }

  const analysisPayload = buildDev2VecAnalysisPayload({
    repository,
    packageRecord,
    commits: userCommits,
    contributionScope,
    githubAccount,
    dev2vecInput,
    dev2vecOutput,
    issueEvidence,
  });

  const analysisResult = await timer.measure('mongoSaveMs', () => AnalysisResult.create({
    userId: user.userId,
    repositoryId: repository._id,
    ...analysisPayload,
  }));
  const repoSnapshot = await timer.measure('snapshotSaveMs', () => createSnapshotFromAnalysisResult(analysisResult));
  timer.log({
    sourceFileCount: Number(dev2vecInput.sourceStats?.sourceFileCount || 0),
    apiTokenCount: Number(dev2vecInput.sourceStats?.apiTokenCount || 0),
      issueStatus: dev2vecInput.evidenceChannels?.channelStatus?.issue,
      commitSource: commitLoad.metadata?.source,
      commitBranch: commitLoad.metadata?.branch,
      fetchedCommitCount: commitLoad.metadata?.fetchedCommitCount,
      normalizedCommitCount: commitLoad.metadata?.normalizedCommitCount,
      commitDetailSource: commitDetailLoad.metadata?.source,
      fetchedCommitDetailCount: commitDetailLoad.metadata?.fetchedDetailCount,
      reusedCommitDetailCount: commitDetailLoad.metadata?.reusedDetailCount,
      matchedUserCommitCount: contributionScope.userCommits.length,
  });

  return {
    message: 'Repository analyzed successfully',
    data: sanitizeAnalysisSnapshot(analysisResult, {
      view: getView(query),
      includeEvidence: shouldIncludeEvidence(query),
      snapshotId: repoSnapshot?._id || null,
    }),
    statusCode: 200,
  };
};

const isTrue = (value) => value === true || value === 'true';

const getTopN = (limit) => Math.min(Number(limit) || 3, 3);

const buildDev2VecOutputFromAnalysis = (analysis = {}) => ({
  success: true,
  modelVersion: analysis.dev2vec?.modelVersion || null,
  vectorDims: analysis.dev2vec?.vectorDims || {},
  vectors: analysis.dev2vec?.vectors || {},
  rolePredictions: analysis.dev2vec?.rolePredictions || [],
  skillGaps: analysis.dev2vec?.skillGaps || {},
  vectorSources: analysis.dev2vec?.vectorSources || {},
  sourceStats: analysis.dev2vec?.sourceStats || {},
  evidencePreview: analysis.dev2vec?.evidencePreview || {},
  repoFeatureEvidence: analysis.dev2vec?.repoFeatureEvidence || analysis.dev2vec?.evidencePreview?.repoFeatures || {},
  scoringMethod: analysis.dev2vec?.scoringMethod || 'dev2vec_doc2vec_classifier',
});

const createDev2VecRoleMatchError = (error) => {
  const statusError = createStatusError(error.message || 'Dev2Vec role matching failed', error.statusCode || 503);
  statusError.errorCode = error.errorCode || 'DEV2VEC_INFERENCE_FAILED';
  return statusError;
};

const filterMatchesByTargetRole = (matches = [], targetRole) => {
  const target = String(targetRole || '').trim().toLowerCase();
  if (!target) return matches;
  return matches.filter((match) => (
    String(match.roleId || '').toLowerCase() === target
    || String(match.roleName || '').toLowerCase() === target
    || String(match.modelLabel || '').toLowerCase() === target
  ));
};

const mapRoleMatchesFromDev2Vec = (dev2vecOutput, { includeDetails = false, limit = 3, targetRole } = {}) => {
  const mapped = mapDev2VecOutputToRoleMatches(dev2vecOutput, { includeDetails, limit });
  return filterMatchesByTargetRole(mapped.matches || [], targetRole).slice(0, limit);
};

const getIssueChannelStatus = (issueEvidence = {}) => {
  const metadata = issueEvidence.metadata || {};
  if (metadata.succeeded === true && Number(metadata.relevantCount || 0) > 0) return 'available';
  if (metadata.succeeded === true && Number(metadata.selectedCount || 0) > 0) return 'no_user_related_issues';
  if (metadata.succeeded === true && Number(metadata.selectedCount || 0) === 0) return 'no_issues';
  if (metadata.status === 403 && String(metadata.errorCode || '').toLowerCase().includes('rate')) return 'rate_limited';
  if (metadata.unavailable === true || metadata.succeeded === false) return 'fetch_failed';
  if (metadata.attempted === false) return 'not_fetched';
  return 'not_fetched';
};

const getModelIssues = (issueEvidence = {}) => (
  getIssueChannelStatus(issueEvidence) === 'available' ? issueEvidence.issues || [] : []
);

const buildRepositoryDev2VecInput = async ({ userId, repository, topN }) => {
  let [githubAccount, packageRecord, cachedCommits] = await Promise.all([
    GithubAccount.findOne({ userId }).lean(),
    RepositoryPackage.findOne({ userId, repositoryId: repository._id }).lean(),
    RepositoryCommit.find({ userId, repositoryId: repository._id }).sort({ authorDate: -1 }).lean(),
  ]);
  if (githubAccount && !hasSourceEvidenceContent(packageRecord)) {
    packageRecord = await ensurePackageSourceEvidence({
      user: { userId },
      repoId: repository._id,
      repository,
      packageRecord,
    });
  }
  const commitLoad = await loadRepositoryCommitsForAnalysis({
    user: { userId },
    repository,
    githubAccount,
    existingCommits: cachedCommits,
  });
  const commits = commitLoad.commits || [];
  const contributionScope = githubAccount
    ? filterUserContributionCommits(commits, githubAccount)
    : { userCommits: commits };
  const detailLoad = githubAccount
    ? await fetchAndCacheCommitDetailsForUserCommits({
        authUser: { userId },
        repository,
        githubAccount,
        commits: contributionScope.userCommits,
        forceRefresh: false,
        includeCodeEvidence: true,
      })
    : { commits: contributionScope.userCommits };
  const issueEvidence = githubAccount
    ? await getRepositoryIssueEvidence({
        user: { userId },
        repository,
      })
    : { issues: [], metadata: { attempted: false, unavailable: true } };

  return buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages: packageRecord ? [packageRecord] : [],
    commits: detailLoad.commits || contributionScope.userCommits,
    issues: getModelIssues(issueEvidence),
    channelStatus: {
      issue: getIssueChannelStatus(issueEvidence),
    },
    topN,
    requestId: `role-matches-${userId}-${repository._id}-${Date.now()}`,
  });
};

const getTopRolesForDebug = (dev2vecOutput = {}) => (
  (dev2vecOutput.rolePredictions || []).slice(0, 3).map((role) => ({
    roleId: role.roleId || role.modelLabel || role.label,
    probability: role.probability,
  }))
);

const getDev2VecOutputForSingleRepo = async ({ userId, repository, analysis, topN, forceRegenerate = false }) => {
  const currentMetadata = getCurrentDev2VecPipelineMetadata();
  const cacheDecision = shouldUseCachedDev2Vec({
    analysis,
    repository,
    forceRegenerate,
    currentMetadata,
  });
  logDev2VecDebug('cache_decision', {
    repoId: repository?._id,
    analysisId: analysis?._id,
    cacheHit: cacheDecision.useCache,
    cacheReason: cacheDecision.reason,
    forceRegenerate,
    pipelineVersion: currentMetadata.analysisPipelineVersion,
    modelArtifactVersion: currentMetadata.modelArtifactVersion,
    scoringVersion: currentMetadata.scoringVersion,
  });

  if (cacheDecision.useCache) {
    return buildDev2VecOutputFromAnalysis(analysis);
  }

  const dev2vecInput = await buildRepositoryDev2VecInput({ userId, repository, topN });
  const startedAt = Date.now();
  const dev2vecOutput = await runDev2VecInference(dev2vecInput);
  const inferenceDurationMs = Date.now() - startedAt;
  dev2vecOutput.evidencePreview = dev2vecInput.evidencePreview || {};
  dev2vecOutput.repoFeatureEvidence = dev2vecInput.repoFeatureEvidence || dev2vecInput.evidencePreview?.repoFeatures || {};
  dev2vecOutput.sourceStats = {
    ...dev2vecInput.sourceStats,
    ...(dev2vecOutput.sourceStats || {}),
  };
  const cacheMetadata = {
    ...getCurrentDev2VecPipelineMetadata(),
    repositoryFingerprint: getRepositoryFingerprint(repository),
  };
  logDev2VecDebug('inference_complete', {
    repoId: repository?._id,
    analysisId: analysis?._id,
    cacheHit: false,
    cacheReason: cacheDecision.reason,
    forceRegenerate,
    pipelineVersion: cacheMetadata.analysisPipelineVersion,
    modelArtifactVersion: cacheMetadata.modelArtifactVersion,
    scoringVersion: cacheMetadata.scoringVersion,
    availableChannels: dev2vecInput.evidenceChannels?.availableChannels || [],
    issueStatus: dev2vecInput.evidenceChannels?.channelStatus?.issue,
    repoTokenCount: Number(dev2vecInput.sourceStats?.repoTokenCount || 0),
    apiTokenCount: Number(dev2vecInput.sourceStats?.apiTokenCount || 0),
    issueTokenCount: Number(dev2vecInput.sourceStats?.issueTokenCount || 0),
    sourceFileCount: Number(dev2vecInput.sourceStats?.sourceFileCount || 0),
    skippedFileCount: Number(dev2vecInput.sourceStats?.skippedFileCount || 0),
    inferenceDurationMs,
    topRoles: getTopRolesForDebug(dev2vecOutput),
  });

  if (analysis?._id) {
    await AnalysisResult.findByIdAndUpdate(analysis._id, {
      $set: {
        dev2vec: {
          modelVersion: dev2vecOutput.modelVersion || null,
          vectorDims: dev2vecOutput.vectorDims || {},
          vectors: dev2vecOutput.vectors || {},
          vectorSources: dev2vecOutput.vectorSources || {},
          sourceStats: {
            ...dev2vecInput.sourceStats,
            ...(dev2vecOutput.sourceStats || {}),
          },
          repoFeatureEvidence: dev2vecInput.repoFeatureEvidence || dev2vecInput.evidencePreview?.repoFeatures || {},
          evidencePreview: dev2vecInput.evidencePreview || {},
          rolePredictions: dev2vecOutput.rolePredictions || [],
          skillGaps: dev2vecOutput.skillGaps || {},
          scoringMethod: 'dev2vec_doc2vec_classifier',
          cacheMetadata,
        },
        rawAnalysis: {
          ...(analysis.rawAnalysis || {}),
          evidenceChannels: dev2vecInput.evidenceChannels || {},
          pipelineMetadata: cacheMetadata,
          dev2vecCacheMetadata: cacheMetadata,
        },
      },
    });
  }

  return dev2vecOutput;
};

const getDev2VecOutputForAnalysisSource = async ({ analysisSource, topN, userId }) => {
  const dev2vecInput = buildDev2VecInputFromAnalysisSource({
    ...analysisSource,
    topN,
    requestId: `role-matches-${userId}-${analysisSource?.sourceMode || 'multi'}-${Date.now()}`,
  });
  return runDev2VecInference(dev2vecInput).then((dev2vecOutput) => ({
    ...dev2vecOutput,
    evidencePreview: dev2vecInput.evidencePreview || {},
    repoFeatureEvidence: dev2vecInput.repoFeatureEvidence || dev2vecInput.evidencePreview?.repoFeatures || {},
    sourceStats: {
      ...dev2vecInput.sourceStats,
      ...(dev2vecOutput.sourceStats || {}),
    },
  }));
};

const logMultiRepoCacheDecisions = (source = {}) => {
  if (!isDev2VecDebugEnabled()) return;
  for (const item of source.analyses || []) {
    const analysis = item.analysis || item;
    const repository = item.repository || {};
    const decision = shouldUseCachedDev2Vec({ analysis, repository });
    logDev2VecDebug('multi_repo_cache_decision', {
      repoId: analysis?.repositoryId || repository?._id,
      analysisId: analysis?._id,
      cacheHit: decision.useCache,
      cacheReason: decision.reason,
      forceRegenerate: false,
    });
  }
};

const hasSourceEvidenceContent = (packageRecord = {}) => (
  stringArray(packageRecord?.detectedFiles?.map((file) => file?.sourceContent || '')).length > 0
);

const ensurePackageSourceEvidence = async ({ user, repoId, repository, packageRecord }) => {
  if (hasSourceEvidenceContent(packageRecord)) return packageRecord;

  await fetchRepositoryPackages(user, repoId || repository?._id);
  return RepositoryPackage.findOne({ userId: user.userId, repositoryId: repository._id }).lean();
};

const formatDetailedRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: match.matchScore,
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  matchedSkillNames: match.matchedSkillNames || [],
  weakSkillNames: match.weakSkillNames || [],
  missingSkillNames: match.missingSkillNames || [],
  recommendedNextSkills: match.recommendedNextSkills || [],
  matchedSkills: match.matchedSkills || [],
  weakSkills: match.weakSkills || [],
  missingRequiredSkills: match.missingRequiredSkills || [],
  missingOptionalSkills: match.missingOptionalSkills || [],
  probability: match.probability,
  rank: match.rank,
  modelLabel: match.modelLabel,
  modelVersion: match.modelVersion,
  scoringMethod: match.scoringMethod,
  vectorSources: match.vectorSources || {},
  sourceStats: match.sourceStats || {},
});

const getSkillName = (item) => {
  if (!item || typeof item !== 'object') return String(item || '').trim();
  return String(item.canonicalSkillName || item.skill || item.skillName || '').trim();
};

const uniqueSkillNames = (items = [], limit = 5) => {
  const seen = new Set();
  const names = [];
  for (const item of items || []) {
    const name = getSkillName(item);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= limit) break;
  }
  return names;
};

const formatCompactRoleMatch = (match) => ({
  roleId: match.roleId,
  roleName: match.roleName,
  matchScore: Number(Number(match.matchScore || 0).toFixed(2)),
  matchLevel: match.matchLevel,
  matchLevelLabel: match.matchLevelLabel,
  matchedSkillNames: uniqueSkillNames(match.matchedSkillNames || match.matchedSkills, 5),
  weakSkillNames: uniqueSkillNames(match.weakSkillNames || match.weakSkills, 5),
  missingSkillNames: uniqueSkillNames(match.missingSkillNames || [
    ...(match.missingRequiredSkills || []),
    ...(match.missingOptionalSkills || []),
  ], 5),
  recommendedNextSkills: uniqueSkillNames(match.recommendedNextSkills || [], 5),
  probability: match.probability,
  rank: match.rank,
  modelLabel: match.modelLabel,
  modelVersion: match.modelVersion,
  scoringMethod: match.scoringMethod,
  vectorSources: match.vectorSources || {},
  sourceStats: match.sourceStats || {},
});

const formatAnalysisSourceForRoleMatches = (analysisSource, includeDetails = false) => {
  if (!analysisSource || typeof analysisSource !== 'object') return null;
  if (includeDetails) return analysisSource;

  if (analysisSource.type === 'user_contribution_analysis') {
    return {
      type: analysisSource.type,
      sourceMode: analysisSource.sourceMode,
      repositoryId: analysisSource.repositoryId,
      repoName: analysisSource.repoName,
      fullName: analysisSource.fullName,
      userCommits: analysisSource.userCommits,
      userLevel: analysisSource.userLevel,
      userReadinessScore: analysisSource.userReadinessScore,
    };
  }

  return {
    type: analysisSource.type,
    sourceMode: analysisSource.sourceMode,
    totalRepositories: analysisSource.totalRepositories,
    totalUserCommits: analysisSource.totalUserCommits,
    userLevel: analysisSource.userLevel,
    userReadinessScore: analysisSource.userReadinessScore,
    repositoryNames: (analysisSource.repositories || [])
      .map((repository) => repository.repoName || repository.fullName)
      .filter(Boolean),
  };
};

const getAnalysisResults = async ({ user, params, query }) => {
  validateAuthUser(user);

  const repository = await findRepositoryForUser(user, params.repoId);
  const analysis = await AnalysisResult.findOne({
    userId: user.userId,
    repositoryId: repository._id,
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  return {
    message: 'Analysis result fetched successfully',
    data: {
      analysis: sanitizeAnalysisSnapshot(analysis, {
        view: getView(query),
        includeEvidence: shouldIncludeEvidence(query),
        snapshotId: null,
      }),
    },
    statusCode: 200,
  };
};

const getMyAnalysisResults = async ({ user, query }) => {
  validateAuthUser(user);

  const snapshots = await AnalysisResult.find({ userId: user.userId })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .select('-rawAnalysis')
    .lean();

  const seenRepositoryIds = new Set();
  const analyses = [];

  for (const snapshot of snapshots) {
    const repositoryId = String(snapshot.repositoryId || '');
    if (!repositoryId || seenRepositoryIds.has(repositoryId)) {
      continue;
    }

    seenRepositoryIds.add(repositoryId);
    analyses.push(
      sanitizeAnalysisSnapshot(snapshot, {
        view: getView(query),
        includeEvidence: shouldIncludeEvidence(query),
        snapshotId: null,
        listItem: true,
      })
    );
  }

  return {
    message: 'My analysis results fetched successfully',
    data: {
      total: analyses.length,
      analyses,
    },
    statusCode: 200,
  };
};

const getRepositoryRoleMatches = async ({ user, params, query = {} }) => {
  validateAuthUser(user);
  const repository = await findRepositoryForUser(user, params.repoId);
  const analysis = await AnalysisResult.findOne({
    userId: user.userId,
    $or: [
      { repositoryId: repository._id },
      { githubRepoId: repository.githubRepoId },
    ],
  })
    .sort({ analyzedAt: -1, createdAt: -1 })
    .lean();

  const limit = getTopN(query.limit);
  const includeDetails = isTrue(query.includeDetails);
  let dev2vecOutput;
  try {
    dev2vecOutput = await getDev2VecOutputForSingleRepo({
      userId: user.userId,
      repository,
      analysis,
      topN: limit,
      forceRegenerate: false,
    });
  } catch (error) {
    throw createDev2VecRoleMatchError(error);
  }

  const matches = mapRoleMatchesFromDev2Vec(dev2vecOutput, {
    includeDetails,
    limit,
    targetRole: query.targetRole,
  }).map((match) => (includeDetails ? formatDetailedRoleMatch(match) : formatCompactRoleMatch(match)));

  return {
    message: 'Role matches calculated successfully',
    data: {
      repositoryId: analysis?.repositoryId || repository._id,
      repoName: analysis?.repoName || repository.name || repository.repoName || '',
      fullName: analysis?.fullName || repository.fullName || '',
      analyzedAt: analysis?.analyzedAt || null,
      topRole: matches.length
        ? {
            roleId: matches[0].roleId,
            roleName: matches[0].roleName,
            matchScore: matches[0].matchScore,
            matchLevel: matches[0].matchLevel,
            matchLevelLabel: matches[0].matchLevelLabel,
          }
        : null,
      matches,
    },
    statusCode: 200,
  };
};

const generateRoleMatches = async ({ user, body = {}, query = {} }) => {
  validateAuthUser(user);

  const limit = getTopN(body.limit);
  const includeDetails = isTrue(body.includeDetails) || isTrue(query.includeDetails) || body.view === 'detail' || query.view === 'detail';
  const forceRegenerate = isTrue(body.forceRegenerate);
  const source = await resolveUserContributionSource({
    userId: user.userId,
    sourceMode: body.sourceMode,
    repoId: body.repoId,
    repoIds: body.repoIds,
  });

  if (source.sourceMode === 'single_repo' && !source.analysisForGap) {
    source.analysisSource = source.analysisSource || {
      type: 'user_contribution_analysis',
      sourceMode: source.sourceMode,
      repositoryId: source.repository?._id || null,
      repoName: source.repository?.name || source.repository?.repoName || '',
      fullName: source.repository?.fullName || '',
    };
  }
  if (source.sourceMode === 'all_analyzed_repos' && !source.analyses.length) {
    throw createStatusError('Please analyze at least one repository before matching roles.', 400);
  }

  let dev2vecOutput;
  try {
    if (source.sourceMode === 'single_repo') {
      dev2vecOutput = await getDev2VecOutputForSingleRepo({
        userId: user.userId,
        repository: source.repository,
        analysis: source.analysisForGap,
        topN: limit,
        forceRegenerate,
      });
    } else {
      logMultiRepoCacheDecisions(source);
      dev2vecOutput = await getDev2VecOutputForAnalysisSource({
        analysisSource: {
          ...source.analysisSource,
          analysis: source.analysisForGap,
          repositories: source.analysisSource?.repositories || source.analyses || [],
        },
        topN: limit,
        userId: user.userId,
      });
    }
  } catch (error) {
    throw createDev2VecRoleMatchError(error);
  }

  const matches = mapRoleMatchesFromDev2Vec(dev2vecOutput, {
    includeDetails,
    limit,
    targetRole: body.targetRole || query.targetRole,
  }).map((match) => (includeDetails ? formatDetailedRoleMatch(match) : formatCompactRoleMatch(match)));

  return {
    message: 'Role matches generated successfully',
    data: {
      sourceMode: source.sourceMode,
      analysisSource: formatAnalysisSourceForRoleMatches(source.analysisSource, includeDetails),
      matches,
    },
    statusCode: 200,
  };
};

module.exports = {
  analyzeRepository,
  buildDev2VecAnalysisPayload,
  getAnalysisResults,
  getMyAnalysisResults,
  getRepositoryRoleMatches,
  generateRoleMatches,
};
