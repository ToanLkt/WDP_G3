const { analyzeCommits } = require('./analysis.commitAnalyzer');
const { calculateScores } = require('./analysis.scoring');
const { dedupeStrings, extractSkillSignals } = require('./analysis.skillExtractor');

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
    packageLower.some((pkg) => ['jest', 'vitest', 'mocha', 'cypress', 'playwright', 'junit'].includes(pkg)) ||
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

const buildAnalysisPayload = ({ repository, packageRecord, commits, rules }) => {
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

  const missingSkills = buildMissingSkills({ checklist, packageRecord: normalizedPackageRecord });
  const recommendations = buildRecommendations({ packageRecord: normalizedPackageRecord, missingSkills, rules });
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
    rules,
  });

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
    strengths: dedupeStrings(strengths.length > 0 ? strengths : rules.defaultStrengths),
    weaknesses: dedupeStrings(weaknesses.length > 0 ? weaknesses : rules.defaultWeaknesses),
    missingSkills,
    recommendations,
    scores,
    commitSummary: commitAnalysis.commitSummary,
    checklist,
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
        totalCommitsLoaded: Array.isArray(commits) ? commits.length : 0,
      },
      matchedPackages: extracted.matchedPackages,
    },
  };
};

const sanitizeAnalysisSnapshot = (snapshot, options = {}) => {
  if (!snapshot) {
    return null;
  }

  const source = snapshot.toObject ? snapshot.toObject() : snapshot;
  const sanitized = { ...source };

  delete sanitized.__v;

  if (options.excludeRawAnalysis) {
    delete sanitized.rawAnalysis;
  }

  return sanitized;
};

module.exports = {
  buildAnalysisPayload,
  sanitizeAnalysisSnapshot,
};
