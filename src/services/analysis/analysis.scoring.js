// Analysis scoring is deterministic and rule-based.
// Scores use detected languages, frameworks, packages, configs, checklist, and commit summary.
// overallScore is a weighted average of the six sub-scores.

const clampScore = (value) => {
  const score = Number(value || 0);
  return Math.max(0, Math.min(100, Math.round(score)));
};

const toLowerList = (values) => (Array.isArray(values) ? values : []).map((value) => String(value || '').toLowerCase());

const includesAny = (values, keywords) => {
  const normalizedValues = toLowerList(values);
  return keywords.some((keyword) => {
    const normalizedKeyword = String(keyword || '').toLowerCase();
    return normalizedValues.some((value) => value.includes(normalizedKeyword));
  });
};

const extractScripts = (packageRecord) => {
  const detectedFiles = Array.isArray(packageRecord && packageRecord.detectedFiles) ? packageRecord.detectedFiles : [];
  const packageJsonFile = detectedFiles.find((file) => file && file.path === 'package.json');
  return Array.isArray(packageJsonFile && packageJsonFile.detectedScripts) ? packageJsonFile.detectedScripts : [];
};

const hasAnyScript = (scripts, names) => names.some((name) => scripts.includes(name));

const DATABASE_KEYWORDS = ['mongoose', 'mongodb', 'mysql', 'pg', 'postgres', 'postgresql', 'prisma', 'sequelize'];
const AUTH_KEYWORDS = ['jwt', 'jsonwebtoken', 'bcrypt', 'bcryptjs', 'auth', 'authentication', 'security'];
const API_KEYWORDS = ['axios', 'fetch', 'external api', 'http client', 'rest api', 'api integration'];
const FRAMEWORK_KEYWORDS = [
  'express',
  'nestjs',
  'fastapi',
  'flask',
  'django',
  'spring',
  'react',
  'vue',
  'angular',
  'next',
  'react native',
  'expo',
  'flutter',
];
const API_DOCS_KEYWORDS = ['swagger', 'openapi', 'api docs', 'swagger-jsdoc', 'swagger-ui-express'];
const DEPLOYMENT_KEYWORDS = ['render', 'vercel', 'netlify', 'railway', 'fly.io', 'flyio', 'deployment', 'hosting'];
const TESTING_KEYWORDS = [
  'jest',
  'vitest',
  'mocha',
  'chai',
  'supertest',
  'cypress',
  'playwright',
  'testing-library',
  'junit',
  'testing',
  'unit testing',
  'e2e testing',
];
const LINT_FORMAT_KEYWORDS = ['eslint', 'prettier', 'linting', 'formatter', 'code formatting'];

const hasStackFit = ({ frameworks, packages, configs, skillSignals, projectType, careerDirection }) => {
  const combined = [...frameworks, ...packages, ...configs, ...skillSignals];
  const career = String(careerDirection || '').toLowerCase();
  const type = String(projectType || '').toLowerCase();

  if ((career.includes('backend') || type.includes('backend')) && includesAny(combined, ['express', 'nestjs', 'database', 'mongodb', 'rest api'])) {
    return true;
  }

  if ((career.includes('frontend') || type.includes('frontend')) && includesAny(combined, ['react', 'vue', 'angular', 'next', 'ui', 'frontend'])) {
    return true;
  }

  if ((career.includes('full-stack') || career.includes('fullstack')) && includesAny(combined, ['frontend', 'backend', 'database'])) {
    return true;
  }

  if ((career.includes('mobile') || type.includes('mobile')) && includesAny(combined, ['react native', 'expo', 'flutter', 'mobile'])) {
    return true;
  }

  if ((career.includes('devops') || type.includes('devops')) && includesAny(combined, ['docker', 'github actions', 'ci/cd', 'deployment'])) {
    return true;
  }

  if ((career.includes('ai') || type.includes('ai') || type.includes('data')) && includesAny(combined, ['python', 'pandas', 'tensorflow', 'pytorch', 'machine learning'])) {
    return true;
  }

  return false;
};

const calculateTechStackScore = ({ languages, frameworks, packages, configs, skillSignals, projectType, careerDirection }) => {
  let score = 0;
  const combined = [...frameworks, ...packages, ...configs, ...skillSignals];

  if ((languages || []).length > 0) {
    score += 20;
  }

  if (includesAny(combined, FRAMEWORK_KEYWORDS)) {
    score += 25;
  }

  if (includesAny(combined, DATABASE_KEYWORDS)) {
    score += 20;
  }

  if (includesAny(combined, AUTH_KEYWORDS)) {
    score += 15;
  }

  if (includesAny(combined, API_KEYWORDS)) {
    score += 10;
  }

  if (hasStackFit({ frameworks, packages, configs, skillSignals, projectType, careerDirection })) {
    score += 10;
  }

  return clampScore(score);
};

const calculateDocumentationScore = ({ checklist, packages, configs, skillSignals, scripts }) => {
  let score = 0;
  const combined = [...packages, ...configs, ...skillSignals];

  if (checklist.hasReadme) {
    score += 40;
  }

  if (checklist.hasEnvExample) {
    score += 25;
  }

  if (includesAny(combined, API_DOCS_KEYWORDS)) {
    score += 25;
  }

  if (checklist.hasPackageFile || hasAnyScript(scripts, ['start', 'dev', 'build'])) {
    score += 10;
  }

  if (!checklist.hasReadme) {
    score = Math.min(score, 50);
  }

  return clampScore(score);
};

const calculateCommitQualityScore = (commitSummary = {}) => {
  const totalCommits = Number(commitSummary.totalCommits || 0);
  if (totalCommits <= 0) {
    return 0;
  }

  let score = 0;
  const activeDays = Number(commitSummary.activeDays || 0);
  const vagueCommitRatio = Number(commitSummary.vagueCommitRatio || 0);
  const conventionalCommitRatio = Number(commitSummary.conventionalCommitRatio || 0);

  if (totalCommits >= 20) score += 30;
  else if (totalCommits >= 10) score += 20;
  else if (totalCommits >= 5) score += 10;

  if (activeDays >= 7) score += 25;
  else if (activeDays >= 3) score += 15;
  else if (activeDays >= 1) score += 5;

  if (vagueCommitRatio <= 0.2) score += 25;
  else if (vagueCommitRatio <= 0.5) score += 15;
  else score += 5;

  if (conventionalCommitRatio >= 0.5) score += 20;
  else if (conventionalCommitRatio >= 0.2) score += 10;
  else if (conventionalCommitRatio > 0) score += 5;

  return clampScore(score);
};

const calculateDeploymentScore = ({ checklist, configs, packages, skillSignals }) => {
  let score = 0;
  const combined = [...configs, ...packages, ...skillSignals];

  if (checklist.hasDocker) score += 30;
  if (checklist.hasDockerCompose) score += 25;
  if (checklist.hasEnvExample) score += 15;
  if (includesAny(combined, DEPLOYMENT_KEYWORDS)) score += 15;
  if (checklist.hasCICD) score += 15;

  return clampScore(score);
};

const calculateTestingScore = ({ checklist, packages, configs, skillSignals, scripts }) => {
  const combined = [...packages, ...configs, ...skillSignals];
  const hasTestingPackage = includesAny(combined, TESTING_KEYWORDS);
  const hasTestScript = hasAnyScript(scripts, ['test']) || includesAny(configs, ['test']);

  if (!checklist.hasTesting && !hasTestingPackage && !hasTestScript) {
    return 0;
  }

  let score = 0;
  if (checklist.hasTesting) score += 40;
  if (hasTestingPackage) score += 30;
  if (hasTestScript) score += 20;
  if (checklist.hasCICD && (hasTestingPackage || hasTestScript)) score += 10;

  return clampScore(score);
};

const calculatePortfolioReadinessScore = ({
  checklist,
  packages,
  configs,
  skillSignals,
  techStackScore,
  documentationScore,
  deploymentScore,
  commitQualityScore,
  testingScore,
}) => {
  let score = 0;
  const combined = [...packages, ...configs, ...skillSignals];

  if (checklist.hasReadme) score += 20;
  if (techStackScore >= 60) score += 20;
  if (documentationScore >= 60) score += 15;
  if (deploymentScore >= 50) score += 15;
  if (commitQualityScore >= 50) score += 10;
  if (testingScore >= 40) score += 10;
  if (checklist.hasLinting || checklist.hasFormatter || includesAny(combined, LINT_FORMAT_KEYWORDS)) score += 10;

  return clampScore(score);
};

const calculateAnalysisScores = ({
  languages = [],
  frameworks = [],
  packages = [],
  configs = [],
  skillSignals = [],
  careerDirection = '',
  projectType = '',
  checklist = {},
  commitSummary = {},
  packageRecord = null,
} = {}) => {
  const scripts = extractScripts(packageRecord).map((script) => String(script || '').trim().toLowerCase());

  const techStackScore = calculateTechStackScore({
    languages,
    frameworks,
    packages,
    configs,
    skillSignals,
    careerDirection,
    projectType,
  });
  const documentationScore = calculateDocumentationScore({ checklist, packages, configs, skillSignals, scripts });
  const commitQualityScore = calculateCommitQualityScore(commitSummary);
  const deploymentScore = calculateDeploymentScore({ checklist, configs, packages, skillSignals });
  const testingScore = calculateTestingScore({ checklist, packages, configs, skillSignals, scripts });
  const portfolioReadinessScore = calculatePortfolioReadinessScore({
    checklist,
    packages,
    configs,
    skillSignals,
    techStackScore,
    documentationScore,
    deploymentScore,
    commitQualityScore,
    testingScore,
  });
  const overallScore = clampScore(
    techStackScore * 0.25 +
      documentationScore * 0.15 +
      commitQualityScore * 0.15 +
      deploymentScore * 0.15 +
      testingScore * 0.15 +
      portfolioReadinessScore * 0.15
  );

  return {
    techStackScore,
    documentationScore,
    commitQualityScore,
    deploymentScore,
    testingScore,
    portfolioReadinessScore,
    overallScore,
  };
};

const calculateScores = (input) => calculateAnalysisScores(input);

module.exports = {
  clampScore,
  calculateAnalysisScores,
  calculateScores,
};
