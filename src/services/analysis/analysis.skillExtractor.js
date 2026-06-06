const normalizePackageName = (value, aliases = {}) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return aliases[normalized] || normalized;
};

const getPackageRule = (rules, packageName) => {
  const packageSkillMap = (rules && rules.packageSkillMap) || {};
  const aliases = (rules && rules.packageAliases) || {};
  const normalizedPackage = normalizePackageName(packageName, aliases);
  const candidates = [
    normalizedPackage,
    normalizedPackage.replace(/-/g, '_'),
    normalizedPackage.replace(/_/g, '-'),
  ];

  for (const candidate of candidates) {
    if (packageSkillMap[candidate]) {
      return {
        normalizedPackage: candidate,
        packageRule: packageSkillMap[candidate],
      };
    }
  }

  return {
    normalizedPackage,
    packageRule: null,
  };
};

const dedupeStrings = (items) => {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    const value = String(item || '').trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(value);
  }

  return results;
};

const pushAll = (target, values) => {
  (values || []).forEach((value) => {
    if (value) {
      target.push(value);
    }
  });
};

const extractSkillSignals = (packageRecord, rules) => {
  const packages = Array.isArray(packageRecord && packageRecord.packages) ? packageRecord.packages : [];
  const frameworks = Array.isArray(packageRecord && packageRecord.frameworks) ? packageRecord.frameworks : [];
  const configs = Array.isArray(packageRecord && packageRecord.configs) ? packageRecord.configs : [];

  const skillSignals = [];
  const careerSignals = [];
  const strengths = [];
  const matchedPackages = [];

  for (const packageName of packages) {
    const { normalizedPackage, packageRule } = getPackageRule(rules, packageName);

    if (!packageRule) {
      continue;
    }

    matchedPackages.push(normalizedPackage);
    pushAll(skillSignals, packageRule.skills);
    pushAll(careerSignals, packageRule.careerSignals);
    if (packageRule.strength) {
      strengths.push(packageRule.strength);
    }
    pushAll(strengths, packageRule.strengths);
  }

  for (const framework of frameworks) {
    const frameworkRule = rules.frameworkSkillMap && rules.frameworkSkillMap[framework];
    if (frameworkRule) {
      pushAll(skillSignals, frameworkRule.skills);
      pushAll(careerSignals, frameworkRule.careerSignals);
      pushAll(strengths, frameworkRule.strengths);
    } else if (framework) {
      skillSignals.push(framework);
    }
  }

  for (const config of configs) {
    const normalizedConfig = String(config || '').trim().toLowerCase();
    const configRules = rules.configRules || {};

    if (normalizedConfig.includes('docker compose')) {
      const configRule = configRules['Docker Compose'] || {
        skills: ['Docker Compose', 'Multi-service Deployment'],
        careerSignals: ['DevOps Engineer', 'Backend Developer'],
      };
      pushAll(skillSignals, configRule.skills);
      pushAll(careerSignals, configRule.careerSignals);
      if (configRule.strength) {
        strengths.push(configRule.strength);
      }
      pushAll(strengths, configRule.strengths);
      continue;
    }

    if (normalizedConfig.includes('docker')) {
      const configRule = configRules.Docker || {
        skills: ['Docker', 'Containerization', 'Deployment'],
        careerSignals: ['Backend Developer', 'DevOps Engineer'],
      };
      pushAll(skillSignals, configRule.skills);
      pushAll(careerSignals, configRule.careerSignals);
      if (configRule.strength) {
        strengths.push(configRule.strength);
      }
      pushAll(strengths, configRule.strengths);
      continue;
    }

    if (normalizedConfig.includes('github actions') || normalizedConfig.includes('ci/cd') || normalizedConfig.includes('cicd')) {
      const configRule = configRules['GitHub Actions'] || {
        skills: ['GitHub Actions', 'CI/CD', 'Automation'],
        careerSignals: ['DevOps Engineer', 'Software Engineer'],
      };
      pushAll(skillSignals, configRule.skills);
      pushAll(careerSignals, configRule.careerSignals);
      if (configRule.strength) {
        strengths.push(configRule.strength);
      }
      pushAll(strengths, configRule.strengths);
    }
  }

  return {
    skillSignals: dedupeStrings(skillSignals),
    careerSignals: dedupeStrings(careerSignals),
    strengths: dedupeStrings(strengths),
    matchedPackages: dedupeStrings(matchedPackages),
  };
};

module.exports = {
  normalizePackageName,
  dedupeStrings,
  extractSkillSignals,
};
