const clampScore = (value) => Math.max(0, Math.min(100, Math.round(value)));

const extractScripts = (packageRecord) => {
  const detectedFiles = Array.isArray(packageRecord && packageRecord.detectedFiles) ? packageRecord.detectedFiles : [];
  const packageJsonFile = detectedFiles.find((file) => file && file.path === 'package.json');
  return Array.isArray(packageJsonFile && packageJsonFile.detectedScripts) ? packageJsonFile.detectedScripts : [];
};

const hasAnyScript = (scripts, names) => names.some((name) => scripts.includes(name));

const calculateScores = ({ packageRecord, checklist, commitSummary, frameworks, languages, packages, rules }) => {
  const scripts = extractScripts(packageRecord).map((script) => String(script || '').trim().toLowerCase());
  const techStackWeights = rules.scoreWeights.techStackScore;
  const documentationWeights = rules.scoreWeights.documentationScore;
  const commitWeights = rules.scoreWeights.commitQualityScore;
  const deploymentWeights = rules.scoreWeights.deploymentScore;
  const testingWeights = rules.scoreWeights.testingScore;
  const portfolioWeights = rules.scoreWeights.portfolioReadinessScore;
  const commitThresholds = (rules.commitRules && rules.commitRules.thresholds) || rules.commitRules || {};

  const techStackScore = clampScore(
    techStackWeights.base +
      techStackWeights.perFramework * frameworks.length +
      techStackWeights.perLanguage * languages.length +
      techStackWeights.perImportantPackage * Math.min(packages.length, 10)
  );

  const hasUsefulScripts = hasAnyScript(scripts, ['start', 'dev', 'test', 'build']);
  const documentationScore = clampScore(
    (checklist.hasReadme ? documentationWeights.hasReadme : 0) +
      (checklist.hasEnvExample ? documentationWeights.hasEnvExample : 0) +
      (hasUsefulScripts ? documentationWeights.hasUsefulScripts : 0)
  );

  let commitQualityScore = 0;
  if (commitSummary.totalCommits > 0) {
    commitQualityScore = commitWeights.base;

    if (commitSummary.totalCommits >= commitThresholds.goodCommitCount) {
      commitQualityScore += commitWeights.goodCommitCount;
    }

    if (commitSummary.conventionalCommitRatio >= commitThresholds.goodConventionalRatio) {
      commitQualityScore += commitWeights.goodConventionalRatio;
    }

    if (commitSummary.activeDays >= commitThresholds.goodActiveDays) {
      commitQualityScore += commitWeights.activeDevelopment;
    }
  }

  const deploymentScore = clampScore(
    (checklist.hasDocker ? deploymentWeights.hasDocker : 0) +
      (checklist.hasDockerCompose ? deploymentWeights.hasDockerCompose : 0) +
      (checklist.hasCICD ? deploymentWeights.hasCICD : 0)
  );

  const hasUnitTest =
    packages.some((pkg) => ['jest', 'vitest', 'mocha', 'junit'].includes(String(pkg || '').trim().toLowerCase())) ||
    frameworks.includes('Testing') ||
    frameworks.includes('Unit Testing');
  const hasE2ETest = packages.some((pkg) => ['cypress', 'playwright'].includes(String(pkg || '').trim().toLowerCase()));
  const hasTestScript = scripts.includes('test');
  const testingScore = clampScore(
    (hasUnitTest ? testingWeights.hasUnitTest : 0) +
      (hasE2ETest ? testingWeights.hasE2ETest : 0) +
      (hasTestScript ? testingWeights.hasTestScript : 0)
  );

  const hasClearTechStack = frameworks.length > 0 || languages.length > 0;
  const hasGoodCommitHistory = commitQualityScore >= 60;
  const hasDeploymentConfig = checklist.hasDocker || checklist.hasCICD;
  const portfolioReadinessScore = clampScore(
    (checklist.hasReadme ? portfolioWeights.hasReadme : 0) +
      (checklist.hasEnvExample ? portfolioWeights.hasEnvExample : 0) +
      (hasClearTechStack ? portfolioWeights.hasClearTechStack : 0) +
      (hasGoodCommitHistory ? portfolioWeights.hasGoodCommitHistory : 0) +
      (hasDeploymentConfig ? portfolioWeights.hasDeploymentConfig : 0)
  );

  const overallScore = clampScore(
    (techStackScore + documentationScore + commitQualityScore + deploymentScore + testingScore + portfolioReadinessScore) / 6
  );

  return {
    techStackScore,
    documentationScore,
    commitQualityScore: clampScore(commitQualityScore),
    deploymentScore,
    testingScore,
    portfolioReadinessScore,
    overallScore,
  };
};

module.exports = {
  calculateScores,
};
