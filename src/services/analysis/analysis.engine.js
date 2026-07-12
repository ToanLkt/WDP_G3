const { analyzeCommits } = require('./analysis.commitAnalyzer');
const { calculateScores } = require('./analysis.scoring');
const { dedupeStrings, extractSkillSignals } = require('./analysis.skillExtractor');
const { buildSkillVectorFromAnalysis } = require('../skillVector.service');
const { generateAnalysisInsightsFromSkillVector } = require('../skillInsight.service');
const {
  buildDocumentationRecommendation,
  detectDocumentationEvidence,
} = require('../../utils/documentationEvidence');

const getFileRule = (rules, checklistKey) => {
  const fileRules = rules.fileRules || {};
  const mapping = {
    hasReadme: ['hasReadme', 'readme'],
    hasEnvExample: ['hasEnvExample', 'envExample', 'env'],
    hasDocker: ['hasDocker', 'docker'],
    hasDockerCompose: ['hasDockerCompose', 'dockerCompose', 'docker'],
    hasCICD: ['hasCICD', 'cicd', 'ciCd'],
  };

  for (const key of mapping[checklistKey] || [checklistKey]) {
    if (fileRules[key]) {
      return fileRules[key];
    }
  }

  return null;
};

const buildChecklist = (packageRecord, skillSignals, docsEvidence = {}) => {
  const packageFiles = Array.isArray(packageRecord && packageRecord.packageFiles) ? packageRecord.packageFiles : [];
  const detectedFiles = Array.isArray(packageRecord && packageRecord.detectedFiles) ? packageRecord.detectedFiles : [];
  const configs = Array.isArray(packageRecord && packageRecord.configs) ? packageRecord.configs : [];
  const packages = Array.isArray(packageRecord && packageRecord.packages) ? packageRecord.packages : [];

  const packageFilesLower = packageFiles.map((file) => String(file || '').toLowerCase());
  const detectedNamesLower = detectedFiles.map((file) => String((file && (file.path || file.fileName)) || '').toLowerCase());
  const configLower = configs.map((config) => String(config || '').toLowerCase());
  const packageLower = packages.map((pkg) => String(pkg || '').toLowerCase());
  const signalLower = skillSignals.map((signal) => String(signal || '').toLowerCase());

  const hasReadme =
    docsEvidence.readmeRootExists === true ||
    packageFilesLower.includes('readme.md') ||
    detectedNamesLower.includes('readme.md');
  const hasEnvExample = packageFilesLower.includes('.env.example') || detectedNamesLower.includes('.env.example');
  const hasDocker =
    packageFilesLower.includes('dockerfile') || detectedNamesLower.includes('dockerfile') || configLower.includes('docker');
  const hasDockerCompose =
    packageFilesLower.includes('docker-compose.yml') ||
    packageFilesLower.includes('docker-compose.yaml') ||
    detectedNamesLower.includes('docker-compose.yml') ||
    detectedNamesLower.includes('docker-compose.yaml') ||
    configLower.includes('docker compose');
  const hasCICD =
    packageFilesLower.includes('.github/workflows') ||
    detectedNamesLower.some((name) => name.startsWith('.github/workflows')) ||
    configLower.includes('github actions') ||
    configLower.includes('ci/cd');
  const hasTesting =
    packageLower.some((pkg) =>
      ['jest', 'vitest', 'mocha', 'chai', 'supertest', 'cypress', 'playwright', 'junit'].includes(pkg)
    ) ||
    packageLower.some((pkg) => pkg.includes('testing-library')) ||
    signalLower.includes('testing') ||
    signalLower.includes('unit testing') ||
    signalLower.includes('e2e testing');
  const hasLinting = packageLower.includes('eslint') || signalLower.includes('linting');
  const hasFormatter = packageLower.includes('prettier') || signalLower.includes('code formatting');
  const hasPackageFile = packageFiles.length > 0;

  return {
    hasReadme,
    hasEnvExample,
    hasDocker,
    hasDockerCompose,
    hasCICD,
    hasTesting,
    hasLinting,
    hasFormatter,
    hasPackageFile,
  };
};

const normalizePackageRecord = (packageRecord) => {
  if (!packageRecord) {
    return null;
  }

  const packageFiles = Array.isArray(packageRecord.packageFiles) ? packageRecord.packageFiles : [];
  const detectedFiles = Array.isArray(packageRecord.detectedFiles) ? packageRecord.detectedFiles : [];
  const configs = Array.isArray(packageRecord.configs) ? [...packageRecord.configs] : [];
  const packageFilesLower = packageFiles.map((file) => String(file || '').toLowerCase());
  const detectedPathsLower = detectedFiles.map((file) => String((file && file.path) || '').toLowerCase());

  if (
    packageFilesLower.includes('docker-compose.yml') ||
    packageFilesLower.includes('docker-compose.yaml') ||
    detectedPathsLower.includes('docker-compose.yml') ||
    detectedPathsLower.includes('docker-compose.yaml')
  ) {
    configs.push('Docker Compose');
  }

  if (packageFilesLower.includes('dockerfile') || detectedPathsLower.includes('dockerfile')) {
    configs.push('Docker');
  }

  if (
    detectedPathsLower.some((path) => path.startsWith('.github/workflows')) ||
    configs.some((config) => String(config || '').toLowerCase().includes('github actions'))
  ) {
    configs.push('GitHub Actions');
  }

  return {
    ...packageRecord,
    configs: dedupeStrings(configs),
  };
};

const inferProjectType = ({ frameworks, configs, packages, rules }) => {
  const frameworkSet = new Set(frameworks.map((item) => String(item || '').toLowerCase()));
  const configSet = new Set(configs.map((item) => String(item || '').toLowerCase()));
  const packageSet = new Set(packages.map((item) => String(item || '').toLowerCase()));

  for (const rule of rules.projectTypeRules || []) {
    const frameworkMatch = (rule.anyFrameworks || []).some((item) => frameworkSet.has(String(item || '').toLowerCase()));
    const configMatch = (rule.anyConfigs || []).some((item) => configSet.has(String(item || '').toLowerCase()));
    const packageMatch = (rule.anyPackages || []).some((item) => packageSet.has(String(item || '').toLowerCase()));

    if (frameworkMatch || configMatch || packageMatch) {
      return rule.type;
    }
  }

  return 'Unknown';
};

const inferCareerDirection = ({ skillSignals, careerSignals, rules }) => {
  const signalSet = new Set(
    dedupeStrings([...(skillSignals || []), ...(careerSignals || [])]).map((signal) => String(signal || '').toLowerCase())
  );

  let bestCareer = 'Generalist Software Engineer';
  let bestScore = 0;

  const careerRules = Array.isArray(rules.careerDirectionRules)
    ? rules.careerDirectionRules
    : Object.entries(rules.careerDirectionRules || {}).map(([careerDirection, rule]) => ({
        careerDirection,
        ...rule,
      }));

  for (const rule of careerRules) {
    let score = 0;

    (rule.requiredSignals || []).forEach((signal) => {
      if (signalSet.has(String(signal || '').toLowerCase())) {
        score += 2;
      }
    });

    (rule.bonusSignals || []).forEach((signal) => {
      if (signalSet.has(String(signal || '').toLowerCase())) {
        score += 1;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestCareer = rule.careerDirection;
    }
  }

  return bestScore > 0 ? bestCareer : 'Generalist Software Engineer';
};

const getPackageRecordFilePaths = (packageRecord) => {
  if (!packageRecord) return [];
  return [
    ...(Array.isArray(packageRecord.packageFiles) ? packageRecord.packageFiles : []),
    ...(Array.isArray(packageRecord.detectedFiles) ? packageRecord.detectedFiles : []),
  ];
};

const buildDocumentationEvidenceForAnalysis = ({ packageRecord, touchedFiles }) => (
  detectDocumentationEvidence([
    ...getPackageRecordFilePaths(packageRecord),
    ...(Array.isArray(touchedFiles) ? touchedFiles : []),
  ])
);

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const getCommitAuthorLogin = (commit) =>
  normalizeText(commit?.rawData?.author?.login || commit?.authorLogin || commit?.rawData?.commit?.author?.login);

const getCommitCommitterLogin = (commit) =>
  normalizeText(commit?.rawData?.committer?.login || commit?.committerLogin || commit?.rawData?.commit?.committer?.login);

const getCommitAuthorId = (commit) => Number(commit?.rawData?.author?.id || commit?.authorGithubId || 0);

const getKnownGithubEmails = (githubAccount = {}) => {
  const values = [
    githubAccount.email,
    githubAccount.primaryEmail,
    githubAccount.verifiedEmail,
    ...(Array.isArray(githubAccount.emails) ? githubAccount.emails : []),
  ];
  return new Set(values.map(normalizeText).filter(Boolean));
};

const getCommitUserMatchInfo = (commit = {}, githubAccount = {}) => {
  const githubUsername = githubAccount.username || '';
  const username = normalizeText(githubUsername);
  const githubId = Number(githubAccount.githubId || 0);
  const knownEmails = getKnownGithubEmails(githubAccount);
  const authorLogin = getCommitAuthorLogin(commit);
  const committerLogin = getCommitCommitterLogin(commit);
  const authorId = getCommitAuthorId(commit);
  const authorEmail = normalizeText(commit.authorEmail || commit?.rawData?.commit?.author?.email);
  const committerEmail = normalizeText(commit.committerEmail || commit?.rawData?.commit?.committer?.email);
  const authorName = normalizeText(commit.authorName || commit?.rawData?.commit?.author?.name);
  const committerName = normalizeText(commit.committerName || commit?.rawData?.commit?.committer?.name);

  if (username && authorLogin === username) return { matched: true, matchedBy: 'author_login' };
  if (username && committerLogin === username) return { matched: true, matchedBy: 'committer_login' };
  if (githubId && authorId === githubId) return { matched: true, matchedBy: 'author_github_id' };
  if (knownEmails.size && (knownEmails.has(authorEmail) || knownEmails.has(committerEmail))) {
    return { matched: true, matchedBy: 'verified_email' };
  }
  if (username && (authorName === username || committerName === username)) {
    return { matched: true, matchedBy: 'fallback_name' };
  }
  return {
    matched: false,
    matchedBy: 'unmatched',
    reason: authorLogin || committerLogin ? 'login_mismatch' : 'missing_github_login',
  };
};

const filterUserContributionCommits = (commits, githubAccount = {}) => {
  const commitList = Array.isArray(commits) ? commits.filter(Boolean) : [];
  const githubUsername = githubAccount.username || '';
  const userCommits = commitList.filter((commit) => getCommitUserMatchInfo(commit, githubAccount).matched);

  return {
    type: 'user_contribution',
    githubUsername,
    totalRepoCommits: commitList.length,
    userCommits,
    analyzedCommitShas: userCommits.map((commit) => commit.sha).filter(Boolean),
  };
};

const buildMissingSkills = ({ checklist, packageRecord }) => {
  if (!packageRecord) {
    return [];
  }

  const missingSkills = [];

  if (!checklist.hasTesting) {
    missingSkills.push('Testing');
  }

  if (!checklist.hasDocker) {
    missingSkills.push('Docker');
  }

  if (!checklist.hasReadme) {
    missingSkills.push('Documentation');
  }

  if (!checklist.hasEnvExample) {
    missingSkills.push('Environment Configuration');
  }

  if (!checklist.hasCICD) {
    missingSkills.push('CI/CD');
  }

  if (!checklist.hasLinting || !checklist.hasFormatter) {
    missingSkills.push('Code Quality');
  }

  return dedupeStrings(missingSkills);
};

const buildRecommendations = ({ packageRecord, missingSkills, rules }) => {
  const recommendations = missingSkills
    .map((skill) => {
      const directRule = rules.missingSkillRules && rules.missingSkillRules[skill];
      if (typeof directRule === 'string') {
        return directRule;
      }

      if (directRule && typeof directRule === 'object') {
        return directRule.recommendation || null;
      }

      const matchedRule = Object.values(rules.missingSkillRules || {}).find(
        (item) => item && typeof item === 'object' && item.missingSkill === skill
      );

      return matchedRule ? matchedRule.recommendation || null : null;
    })
    .filter(Boolean);

  if (!packageRecord) {
    recommendations.push('Fetch repository package/config files before re-analyzing for more accurate stack detection.');
  }

  return dedupeStrings(recommendations);
};

const getTouchedFileNames = (commits) => {
  const files = [];
  for (const commit of Array.isArray(commits) ? commits : []) {
    for (const file of Array.isArray(commit.files) ? commit.files : []) {
      const filename = String(file?.filename || file?.path || '').trim();
      if (filename) files.push(filename);
    }
  }
  return dedupeStrings(files);
};

const shouldSuppressDocumentationGap = (docsEvidence = {}) => (
  docsEvidence.readmeRootExists === true
  || Number(docsEvidence.markdownFileCount || 0) > 0
  || docsEvidence.hasDocsDirectory === true
);

const removeDocumentationGaps = (values = [], docsEvidence = {}) => {
  if (!shouldSuppressDocumentationGap(docsEvidence)) return values;
  return values.filter((value) => {
    const text = String(value || '').toLowerCase();
    return !(
      text.includes('documentation')
      || text.includes('readme')
      || text.includes('tài liệu')
      || text.includes('tai lieu')
    );
  });
};

const applyDocumentationRecommendation = (recommendations = [], docsEvidence = {}) => {
  const cleaned = removeDocumentationGaps(recommendations, docsEvidence);
  const recommendation = buildDocumentationRecommendation(docsEvidence);
  if (
    recommendation
    && docsEvidence.documentationStatus !== 'no_markdown_docs'
    && docsEvidence.documentationStatus !== 'unknown'
  ) {
    cleaned.push(recommendation);
  }
  if (docsEvidence.documentationStatus === 'unknown') {
    cleaned.push(recommendation);
  }
  return dedupeStrings(cleaned);
};

const calculateContributionScore = (commitSummary = {}) => {
  const total = Number(commitSummary.totalCommits || 0);
  let score = 0;
  if (total > 20) score = 100;
  else if (total >= 11) score = 80;
  else if (total >= 6) score = 65;
  else if (total >= 3) score = 45;
  else if (total >= 1) score = 20;

  const activeDays = Number(commitSummary.activeDays || 0);
  if (activeDays > 7) score += 15;
  else if (activeDays >= 4) score += 10;
  else if (activeDays >= 2) score += 5;

  return clamp(score, 0, 100);
};

const calculateUserCommitQualityScore = (commitSummary = {}) =>
  clamp(
    70 - Number(commitSummary.vagueCommitRatio || 0) * 50 + Number(commitSummary.conventionalCommitRatio || 0) * 30,
    0,
    100
  );

const calculateProjectCompletenessScore = ({ files, checklist }) => {
  if (files.length > 0) {
    const lowerFiles = files.map((file) => file.toLowerCase());
    let score = 0;
    if (lowerFiles.some((file) => /\.(js|jsx|ts|tsx|java|cs|go|py|php|rb)$/.test(file) && !file.includes('.test.') && !file.includes('.spec.'))) score += 40;
    if (lowerFiles.some((file) => /(^|\/)(\.env|config|database|db|routes?|api|swagger|openapi)/.test(file))) score += 20;
    if (lowerFiles.some((file) => /(\.test\.|\.spec\.|__tests__|tests?\/)/.test(file))) score += 15;
    if (lowerFiles.some((file) => /(readme|docs?\/|swagger|openapi)/.test(file))) score += 10;
    if (lowerFiles.some((file) => /(dockerfile|docker-compose|\.github\/workflows|\.gitlab-ci|deploy|vercel|render|railway)/.test(file))) score += 15;
    return { score: clamp(score, 0, 100), confidence: 'high' };
  }

  const fallbackScore =
    (checklist.hasPackageFile ? 40 : 0) +
    (checklist.hasEnvExample || checklist.hasCICD ? 20 : 0) +
    (checklist.hasTesting ? 15 : 0) +
    (checklist.hasReadme ? 10 : 0) +
    (checklist.hasDocker || checklist.hasDockerCompose ? 15 : 0);
  return { score: clamp(fallbackScore, 0, 100), confidence: fallbackScore > 0 ? 'medium' : 'low' };
};

const hasMissingSkill = (skillVector, names, priority) => {
  const nameSet = new Set(names.map((name) => name.toLowerCase()));
  return (Array.isArray(skillVector) ? skillVector : []).some((item) => {
    const name = String(item.canonicalSkillName || item.skill || '').toLowerCase();
    return nameSet.has(name) && item.level === 'missing' && (!priority || item.priority === priority);
  });
};

const calculateMissingCriticalPenalty = ({ skillVector, careerDirection }) => {
  const career = normalizeText(careerDirection);
  if (!career.includes('backend')) return 0;
  const penalties = [
    [['testing'], 8],
    [['ci/cd', 'github actions'], 5],
    [['clean code', 'code quality'], 5],
    [['database', 'mongodb', 'mongoose'], 8],
    [['rest api'], 6],
    [['authentication', 'jwt authentication'], 6],
  ];
  const total = penalties.reduce((sum, [names, penalty]) => sum + (hasMissingSkill(skillVector, names) ? penalty : 0), 0);
  return Math.min(total, 20);
};

const calculateUserReadiness = ({ skillVector, commitSummary, checklist, careerDirection, files }) => {
  const toScore100 = (value) => {
    const score = Number(value) || 0;
    return score <= 1 ? score * 100 : score;
  };
  const presentSkills = (Array.isArray(skillVector) ? skillVector : [])
    .filter((item) => item.level !== 'missing' && Number(item.score || 0) > 0)
    .sort((left, right) => toScore100(right.score) - toScore100(left.score));
  const topFive = presentSkills.slice(0, 5);
  const skillScore = topFive.length
    ? topFive.reduce((sum, item) => sum + toScore100(item.score), 0) / topFive.length
    : 0;
  const contributionScore = calculateContributionScore(commitSummary);
  const commitQualityScore = calculateUserCommitQualityScore(commitSummary);
  const completeness = calculateProjectCompletenessScore({ files, checklist });
  const missingCriticalPenalty = calculateMissingCriticalPenalty({ skillVector, careerDirection });
  const rawScore =
    skillScore * 0.45 +
    contributionScore * 0.25 +
    commitQualityScore * 0.15 +
    completeness.score * 0.1 -
    missingCriticalPenalty;
  const userReadinessScore = Math.round(clamp(rawScore, 0, 100));
  const strongSkillCount = presentSkills.filter((item) => item.level === 'strong' || toScore100(item.score) >= 70).length;
  const lacksAdvancedEvidence =
    Number(commitSummary.totalCommits || 0) < 10 ||
    strongSkillCount < 4 ||
    hasMissingSkill(skillVector, ['testing']) ||
    hasMissingSkill(skillVector, ['clean code', 'code quality']);
  let userLevel = userReadinessScore < 45 ? 'beginner' : userReadinessScore < 80 ? 'intermediate' : 'advanced';
  if (userLevel === 'advanced' && (lacksAdvancedEvidence || presentSkills.length < 3)) {
    userLevel = 'intermediate';
  }

  const confidence = presentSkills.length < 3 || Number(commitSummary.totalCommits || 0) < 3 ? 'low' : completeness.confidence;
  return {
    summary: { userLevel, userReadinessScore, confidence },
    scoreBreakdown: {
      skillScore: Math.round(skillScore),
      contributionScore,
      commitQualityScore: Math.round(commitQualityScore),
      projectCompletenessScore: Math.round(completeness.score),
      missingCriticalPenalty,
      confidence,
    },
  };
};

const buildAnalysisPayload = ({ repository, packageRecord, commits, rules, contributionScope }) => {
  const normalizedPackageRecord = normalizePackageRecord(packageRecord);
  const languages = dedupeStrings(
    normalizedPackageRecord && Array.isArray(normalizedPackageRecord.languages) && normalizedPackageRecord.languages.length > 0
      ? normalizedPackageRecord.languages
      : repository.language
      ? [repository.language]
      : []
  );
  const frameworks = dedupeStrings((normalizedPackageRecord && normalizedPackageRecord.frameworks) || []);
  const packages = dedupeStrings((normalizedPackageRecord && normalizedPackageRecord.packages) || []);
  const configs = dedupeStrings((normalizedPackageRecord && normalizedPackageRecord.configs) || []);

  const extracted = extractSkillSignals(normalizedPackageRecord, rules);
  const commitAnalysis = analyzeCommits(commits, rules);
  const touchedFiles = getTouchedFileNames(commits);
  const docsEvidence = buildDocumentationEvidenceForAnalysis({
    packageRecord: normalizedPackageRecord,
    touchedFiles,
  });
  const checklist = buildChecklist(normalizedPackageRecord, extracted.skillSignals, docsEvidence);

  const strengths = [...extracted.strengths, ...commitAnalysis.strengths];
  const weaknesses = [...commitAnalysis.weaknesses];

  if (normalizedPackageRecord) {
    ['hasReadme', 'hasEnvExample', 'hasDocker', 'hasDockerCompose', 'hasCICD'].forEach((key) => {
      const fileRule = getFileRule(rules, key);
      if (!fileRule) {
        return;
      }

      if (checklist[key]) {
        strengths.push(fileRule.strength);
      } else if (key === 'hasReadme' && shouldSuppressDocumentationGap(docsEvidence)) {
        // Markdown/docs exist, so avoid claiming that documentation is missing.
      } else if (fileRule.weakness) {
        weaknesses.push(fileRule.weakness);
      }
    });

    if (!checklist.hasTesting) {
      weaknesses.push('Repository does not show clear automated testing setup.');
    }

    if (!checklist.hasLinting || !checklist.hasFormatter) {
      weaknesses.push('Repository lacks strong code quality tooling signals.');
    }
  } else {
    weaknesses.push('Repository package/config data has not been fetched yet.');
  }

  let missingSkills = removeDocumentationGaps(
    buildMissingSkills({ checklist, packageRecord: normalizedPackageRecord }),
    docsEvidence
  );
  let recommendations = applyDocumentationRecommendation(
    buildRecommendations({ packageRecord: normalizedPackageRecord, missingSkills, rules }),
    docsEvidence
  );
  const projectType = inferProjectType({ frameworks, configs, packages, rules });
  const careerDirection = inferCareerDirection({
    skillSignals: extracted.skillSignals,
    careerSignals: extracted.careerSignals,
    rules,
  });
  const scores = calculateScores({
    packageRecord: normalizedPackageRecord,
    checklist,
    commitSummary: commitAnalysis.commitSummary,
    frameworks,
    languages,
    packages,
    configs,
    skillSignals: extracted.skillSignals,
    careerDirection,
    projectType,
  });

  if (scores.testingScore === 0) {
    weaknesses.push('Repo chua co automated testing setup ro rang.');
    missingSkills.push('Testing');
  }

  if (scores.deploymentScore < 50) {
    weaknesses.push('Repo con thieu tin hieu trien khai nhu Docker, CI/CD hoac deployment config.');
    missingSkills.push('Deployment');
  }

  if (scores.documentationScore < 60) {
    recommendations = applyDocumentationRecommendation([
      ...recommendations,
      'Nen bo sung README, .env.example hoac API docs de cai thien kha nang ban giao project.',
    ], docsEvidence);
  }

  missingSkills = dedupeStrings(removeDocumentationGaps(missingSkills, docsEvidence));
  recommendations = applyDocumentationRecommendation(recommendations, docsEvidence);
  const skillRepresentation = buildSkillVectorFromAnalysis({
    languages,
    frameworks,
    packages,
    configs,
    skillSignals: extracted.skillSignals,
    careerSignals: extracted.careerSignals,
    checklist,
    scores,
    missingSkills,
    projectType,
    careerDirection,
  });
  const vectorInsights = generateAnalysisInsightsFromSkillVector(skillRepresentation.skillVector, {
    projectType,
    careerDirection,
    scores,
    checklist,
    languages,
    frameworks,
    packages,
    configs,
    commitSummary: commitAnalysis.commitSummary,
  });
  const oldStrengths = dedupeStrings(strengths.length > 0 ? strengths : rules.defaultStrengths);
  const oldWeaknesses = dedupeStrings(weaknesses.length > 0 ? weaknesses : rules.defaultWeaknesses);
  const readiness = calculateUserReadiness({
    skillVector: skillRepresentation.skillVector,
    commitSummary: commitAnalysis.commitSummary,
    checklist,
    careerDirection,
    files: touchedFiles,
  });
  const analysisScope = {
    type: 'user_contribution',
    githubUsername: contributionScope?.githubUsername || '',
    totalRepoCommits: Number(contributionScope?.totalRepoCommits || 0),
    userCommits: commitAnalysis.commitSummary.totalCommits,
    activeDays: commitAnalysis.commitSummary.activeDays,
    firstCommitDate: commitAnalysis.commitSummary.firstCommitDate,
    lastCommitDate: commitAnalysis.commitSummary.lastCommitDate,
    analyzedCommitShas: Array.isArray(contributionScope?.analyzedCommitShas) ? contributionScope.analyzedCommitShas : [],
    userLevel: readiness.summary.userLevel,
  };

  return {
    githubRepoId: repository.githubRepoId,
    repoName: repository.name,
    fullName: repository.fullName,
    projectType,
    languages,
    frameworks,
    packages,
    configs,
    skillSignals: dedupeStrings(extracted.skillSignals),
    careerSignals: dedupeStrings(extracted.careerSignals),
    careerDirection,
    strengths: vectorInsights.strengths.length ? vectorInsights.strengths : oldStrengths,
    weaknesses: removeDocumentationGaps(
      vectorInsights.weaknesses.length ? vectorInsights.weaknesses : oldWeaknesses,
      docsEvidence
    ),
    missingSkills: removeDocumentationGaps(
      vectorInsights.missingSkills.length ? vectorInsights.missingSkills : missingSkills,
      docsEvidence
    ),
    recommendations: applyDocumentationRecommendation(
      vectorInsights.recommendations.length ? vectorInsights.recommendations : recommendations,
      docsEvidence
    ),
    scores,
    summary: {
      careerDirection,
      userLevel: readiness.summary.userLevel,
      userReadinessScore: readiness.summary.userReadinessScore,
      overallScore: scores.overallScore || 0,
      projectType,
      confidence: readiness.summary.confidence,
    },
    analysisScope,
    scoreBreakdown: readiness.scoreBreakdown,
    commitSummary: commitAnalysis.commitSummary,
    checklist,
    ...skillRepresentation,
    rawAnalysis: {
      repository: {
        id: repository._id,
        githubRepoId: repository.githubRepoId,
        fullName: repository.fullName,
      },
      packageSnapshot: packageRecord
        ? {
            packageFiles: normalizedPackageRecord.packageFiles || [],
            detectedFiles: normalizedPackageRecord.detectedFiles || [],
            documentation: docsEvidence,
            lastFetchedAt: normalizedPackageRecord.lastFetchedAt || null,
          }
        : null,
      commitSnapshot: {
        totalCommitsLoaded: Number(contributionScope?.totalRepoCommits || (Array.isArray(commits) ? commits.length : 0)),
        userCommitsLoaded: Array.isArray(commits) ? commits.length : 0,
      },
      matchedPackages: extracted.matchedPackages,
    },
  };
};

const toPlainObject = (snapshot) => (snapshot && snapshot.toObject ? snapshot.toObject() : snapshot);

const pickRepository = (source) => ({
  repositoryId: source.repositoryId,
  githubRepoId: source.githubRepoId,
  repoName: source.repoName,
  fullName: source.fullName,
});

const toDisplaySkillScore = (value) => {
  const score = Number(value) || 0;
  const scaled = score <= 1 ? score * 100 : score;
  return Math.round(scaled * 100) / 100;
};

const formatSkill = (item) => ({
  skill: item.skill,
  canonicalSkillName: item.canonicalSkillName,
  category: item.category,
  score: toDisplaySkillScore(item.score),
  level: item.level === 'missing' ? 'weak' : item.level,
});

const getTopSkills = (skillVector, limit = 5) =>
  (Array.isArray(skillVector) ? skillVector : [])
    .filter((item) => item && item.level !== 'missing' && Number(item.score || 0) > 0)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, limit)
    .map(formatSkill);

const formatDebugSkill = (item) => ({
  skill: item.skill,
  canonicalSkillName: item.canonicalSkillName,
  normalizedSkillName: item.normalizedSkillName,
  category: item.category,
  score: toDisplaySkillScore(item.score),
  level: item.level,
  rawSimilarity: Number.isFinite(Number(item.similarity)) ? Number(item.similarity) : Number(item.score || 0),
  dev2vecStatus: item.dev2vecStatus,
  evidenceDetected: item.evidenceDetected,
  evidenceStatus: item.evidenceStatus,
  reason: item.reason,
  evidence: Array.isArray(item.evidence) ? item.evidence : [],
  sources: Array.isArray(item.sources) ? item.sources : [],
  lastCalculatedAt: item.lastCalculatedAt,
});

const getPriority = (item, index) => {
  if (item.priority) return item.priority;
  if (index < 2) return 'high';
  if (index < 4) return 'medium';
  return 'low';
};

const getMissingSkills = (source, limit = 5) => {
  const missingFromVector = (Array.isArray(source.skillVector) ? source.skillVector : [])
    .filter((item) => item && item.level === 'missing')
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .map((item, index) => ({
      skill: item.skill,
      canonicalSkillName: item.canonicalSkillName,
      category: item.category,
      priority: getPriority(item, index),
    }));

  if (missingFromVector.length) return missingFromVector.slice(0, limit);

  return (Array.isArray(source.missingSkills) ? source.missingSkills : []).slice(0, limit).map((skill, index) => ({
    skill,
    canonicalSkillName: skill,
    category: 'General',
    priority: getPriority({}, index),
  }));
};

const contributionWording = (sentence, kind) => {
  const text = String(sentence || '').trim();
  if (!text) return '';
  if (/^(H\u1ec7 th\u1ed1ng|\u0110\u00e3 th\u1ea5y|Dev2Vec|Ch\u01b0a th\u1ea5y|B\u1ea1n n\u00ean)\b/i.test(text)) return text;
  let updated = text
    .replace(/^Repo\s+(thể hiện|có)/i, 'Phần commit của bạn cho thấy')
    .replace(/^Repository\s+(shows|has)/i, 'Your contribution shows')
    .replace(/^Repo\s+chưa/i, 'Chưa thấy đóng góp rõ')
    .replace(/^Repository\s+does not/i, 'Chưa thấy đóng góp rõ')
    .replace(/^Nên\s+/i, 'Bạn nên ');

  if (updated === text) {
    if (kind === 'strengths') updated = `Bạn có đóng góp thể hiện ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    if (kind === 'weaknesses') updated = `Chưa thấy đóng góp rõ về ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    if (kind === 'recommendations' && !/^Bạn nên/i.test(updated)) updated = `Bạn nên ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }

  return updated;
};

const formatSentences = (source, key, limit) => {
  const scopeType = source.analysisScope?.type;
  return (Array.isArray(source[key]) ? source[key] : [])
    .map((sentence) => (scopeType === 'user_contribution' ? contributionWording(sentence, key) : sentence))
    .filter(Boolean)
    .slice(0, limit);
};

const buildAnalysisScopeSummary = (source) => {
  const commitSummary = source.commitSummary || {};
  return {
    type: source.analysisScope?.type || 'user_contribution',
    githubUsername: source.analysisScope?.githubUsername || '',
    totalRepoCommits: Number(source.analysisScope?.totalRepoCommits || commitSummary.totalCommits || 0),
    userCommits: Number(source.analysisScope?.userCommits || commitSummary.totalCommits || 0),
    activeDays: Number(source.analysisScope?.activeDays || commitSummary.activeDays || 0),
    firstCommitDate: source.analysisScope?.firstCommitDate || commitSummary.firstCommitDate || null,
    lastCommitDate: source.analysisScope?.lastCommitDate || commitSummary.lastCommitDate || null,
  };
};

const buildSummary = (source) => ({
  careerDirection: source.summary?.careerDirection || source.careerDirection,
  userLevel: source.summary?.userLevel || 'beginner',
  userReadinessScore: Number(source.summary?.userReadinessScore || 0),
  overallScore: Number(source.summary?.overallScore || source.scores?.overallScore || 0),
  projectType: source.summary?.projectType || source.projectType,
  confidence: source.summary?.confidence || source.scoreBreakdown?.confidence || 'low',
});

const formatAnalysisResponse = (snapshot, options = {}) => {
  if (!snapshot) {
    return null;
  }

  const source = toPlainObject(snapshot);
  const view = options.view === 'detail' ? 'detail' : 'summary';
  const includeEvidence = options.includeEvidence === true || options.includeEvidence === 'true';
  const analysisScope = buildAnalysisScopeSummary(source);
  const formatted = {
    analysisId: source._id,
    snapshotId: options.snapshotId || source.snapshotId || null,
    repository: pickRepository(source),
    analysisScope,
    summary: buildSummary(source),
    topSkills: getTopSkills(source.skillVector, 5),
    missingSkills: getMissingSkills(source, 5),
    strengths: formatSentences(source, 'strengths', options.listItem ? 3 : 3),
    weaknesses: formatSentences(source, 'weaknesses', options.listItem ? 3 : 3),
    recommendations: formatSentences(source, 'recommendations', options.listItem ? 3 : 3),
    createdAt: source.createdAt,
  };

  if (options.listItem) {
    delete formatted.strengths;
    delete formatted.weaknesses;
    delete formatted.recommendations;
    delete formatted.createdAt;
    formatted.analyzedAt = source.analyzedAt;
  }

  if (view === 'detail' && options.listItem !== true) {
    formatted.analyzedAt = source.analyzedAt;
    formatted.analysisScope = {
      ...formatted.analysisScope,
      analyzedCommitShas: Array.isArray(source.analysisScope?.analyzedCommitShas) ? source.analysisScope.analyzedCommitShas : [],
    };
    formatted.scoreBreakdown = source.scoreBreakdown || {};

    if (includeEvidence) {
      formatted.debug = {
        skillVector: (Array.isArray(source.skillVector) ? source.skillVector : []).map(formatDebugSkill),
      };
      if (source.dev2vec) {
        formatted.debug.dev2vec = {
          modelVersion: source.dev2vec.modelVersion || null,
          vectorDims: source.dev2vec.vectorDims || {},
          vectorSources: source.dev2vec.vectorSources || {},
          sourceStats: source.dev2vec.sourceStats || {},
          evidencePreview: source.dev2vec.evidencePreview || {},
          rolePredictions: source.dev2vec.rolePredictions || [],
          skillGaps: source.dev2vec.skillGaps || {},
          scoringMethod: source.dev2vec.scoringMethod || '',
        };
      }
    }
  }

  return formatted;
};

const sanitizeAnalysisSnapshot = (snapshot, options = {}) => {
  return formatAnalysisResponse(snapshot, {
    ...options,
    view: options.view === 'detail' ? 'detail' : 'summary',
    includeEvidence: options.includeEvidence === true || options.includeEvidence === 'true',
  });
};

module.exports = {
  buildAnalysisPayload,
  filterUserContributionCommits,
  getCommitUserMatchInfo,
  formatAnalysisResponse,
  sanitizeAnalysisSnapshot,
};
