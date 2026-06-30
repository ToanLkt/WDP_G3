const { analyzeCommits } = require('./analysis.commitAnalyzer');
const { calculateScores } = require('./analysis.scoring');
const { dedupeStrings, extractSkillSignals } = require('./analysis.skillExtractor');
const { buildSkillVectorFromAnalysis } = require('../skillVector.service');
const { generateAnalysisInsightsFromSkillVector } = require('../skillInsight.service');

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

const buildChecklist = (packageRecord, skillSignals) => {
  const packageFiles = Array.isArray(packageRecord && packageRecord.packageFiles) ? packageRecord.packageFiles : [];
  const detectedFiles = Array.isArray(packageRecord && packageRecord.detectedFiles) ? packageRecord.detectedFiles : [];
  const configs = Array.isArray(packageRecord && packageRecord.configs) ? packageRecord.configs : [];
  const packages = Array.isArray(packageRecord && packageRecord.packages) ? packageRecord.packages : [];

  const packageFilesLower = packageFiles.map((file) => String(file || '').toLowerCase());
  const detectedNamesLower = detectedFiles.map((file) => String((file && (file.path || file.fileName)) || '').toLowerCase());
  const configLower = configs.map((config) => String(config || '').toLowerCase());
  const packageLower = packages.map((pkg) => String(pkg || '').toLowerCase());
  const signalLower = skillSignals.map((signal) => String(signal || '').toLowerCase());

  const hasReadme = packageFilesLower.includes('readme.md') || detectedNamesLower.includes('readme.md');
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

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

const getCommitAuthorLogin = (commit) =>
  normalizeText(commit?.rawData?.author?.login || commit?.authorLogin || commit?.rawData?.commit?.author?.login);

const getCommitCommitterLogin = (commit) =>
  normalizeText(commit?.rawData?.committer?.login || commit?.committerLogin || commit?.rawData?.commit?.committer?.login);

const getCommitAuthorId = (commit) => Number(commit?.rawData?.author?.id || commit?.authorGithubId || 0);

const filterUserContributionCommits = (commits, githubAccount = {}) => {
  const commitList = Array.isArray(commits) ? commits.filter(Boolean) : [];
  const githubUsername = githubAccount.username || '';
  const username = normalizeText(githubUsername);
  const githubId = Number(githubAccount.githubId || 0);
  const userCommits = commitList.filter((commit) => {
    const authorLogin = getCommitAuthorLogin(commit);
    const committerLogin = getCommitCommitterLogin(commit);
    const authorId = getCommitAuthorId(commit);
    const authorEmail = normalizeText(commit.authorEmail);
    const authorName = normalizeText(commit.authorName);
    const committerName = normalizeText(commit.committerName);

    return (
      (username && (authorLogin === username || committerLogin === username || authorName === username || committerName === username)) ||
      (githubId && authorId === githubId) ||
      (username && authorEmail.includes(`${username}@`)) ||
      (githubId && authorEmail.includes(`${githubId}+${username}@users.noreply.github.com`))
    );
  });

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
  const presentSkills = (Array.isArray(skillVector) ? skillVector : [])
    .filter((item) => item.level !== 'missing' && Number(item.score || 0) > 0)
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  const topFive = presentSkills.slice(0, 5);
  const skillScore = topFive.length
    ? (topFive.reduce((sum, item) => sum + Number(item.score || 0), 0) / topFive.length) * 100
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
  const strongSkillCount = presentSkills.filter((item) => item.level === 'strong' || Number(item.score || 0) >= 0.7).length;
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
  const checklist = buildChecklist(normalizedPackageRecord, extracted.skillSignals);
  const commitAnalysis = analyzeCommits(commits, rules);
  const touchedFiles = getTouchedFileNames(commits);

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

  let missingSkills = buildMissingSkills({ checklist, packageRecord: normalizedPackageRecord });
  let recommendations = buildRecommendations({ packageRecord: normalizedPackageRecord, missingSkills, rules });
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
    recommendations.push('Nen bo sung README, .env.example hoac API docs de cai thien kha nang ban giao project.');
  }

  missingSkills = dedupeStrings(missingSkills);
  recommendations = dedupeStrings(recommendations);
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
    weaknesses: vectorInsights.weaknesses.length ? vectorInsights.weaknesses : oldWeaknesses,
    missingSkills: vectorInsights.missingSkills.length ? vectorInsights.missingSkills : missingSkills,
    recommendations: vectorInsights.recommendations.length ? vectorInsights.recommendations : recommendations,
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

const formatSkill = (item) => ({
  skill: item.skill,
  canonicalSkillName: item.canonicalSkillName,
  category: item.category,
  score: item.score,
  level: item.level,
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
  score: item.score,
  level: item.level,
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
  formatAnalysisResponse,
  sanitizeAnalysisSnapshot,
};
