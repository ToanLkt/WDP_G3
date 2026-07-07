// Deprecated legacy skill evidence weighting.
// Dev2Vec analysis/role-match/roadmap paths build model input and skill gaps
// from Dev2Vec services instead of using these package/config weights.
const {
  canonicalizeSkillName,
  getCanonicalSkillCategory,
  isKnownSkill,
  normalizeSkillText,
} = require('../utils/skillCanonicalizer');

const LANGUAGE_SKILLS = new Map(
  ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'SQL'].map((name) => [name.toLowerCase(), name])
);

const PACKAGE_SKILLS = {
  express: [{ skill: 'Express.js', weight: 0.9 }, { skill: 'Node.js', weight: 0.55 }, { skill: 'REST API', weight: 0.5 }],
  mongoose: [{ skill: 'Mongoose', weight: 0.9 }, { skill: 'MongoDB', weight: 0.55 }],
  mongodb: [{ skill: 'MongoDB', weight: 0.85 }],
  jsonwebtoken: [{ skill: 'JWT Authentication', weight: 0.8 }],
  bcrypt: [{ skill: 'Authentication', weight: 0.7 }],
  bcryptjs: [{ skill: 'Authentication', weight: 0.7 }],
  dotenv: [{ skill: 'Environment Variables', weight: 0.75 }],
  multer: [{ skill: 'File Upload', weight: 0.8 }],
  'swagger-jsdoc': [{ skill: 'Swagger', weight: 0.8 }],
  'swagger-ui-express': [{ skill: 'Swagger', weight: 0.75 }],
  cors: [{ skill: 'REST API', weight: 0.55 }],
  joi: [{ skill: 'Validation', weight: 0.75 }],
  zod: [{ skill: 'Validation', weight: 0.75 }],
  'express-validator': [{ skill: 'Validation', weight: 0.8 }],
  react: [{ skill: 'React', weight: 0.9 }],
  'react-dom': [{ skill: 'React', weight: 0.75 }],
  'react-router-dom': [{ skill: 'React Router', weight: 0.85 }],
  axios: [{ skill: 'Axios', weight: 0.85 }, { skill: 'API Integration', weight: 0.55 }],
  tailwindcss: [{ skill: 'Tailwind CSS', weight: 0.85 }],
  bootstrap: [{ skill: 'Bootstrap', weight: 0.8 }],
  vite: [{ skill: 'Vite', weight: 0.8 }],
  redux: [{ skill: 'State Management', weight: 0.8 }],
  '@reduxjs/toolkit': [{ skill: 'State Management', weight: 0.85 }],
  jest: [{ skill: 'Jest', weight: 0.9 }, { skill: 'Testing', weight: 0.6 }],
  vitest: [{ skill: 'Testing', weight: 0.8 }],
  supertest: [{ skill: 'API Testing', weight: 0.85 }, { skill: 'Testing', weight: 0.55 }],
  mocha: [{ skill: 'Testing', weight: 0.8 }],
  chai: [{ skill: 'Testing', weight: 0.75 }],
  eslint: [{ skill: 'Linting', weight: 0.85 }],
  prettier: [{ skill: 'Formatting', weight: 0.85 }],
  '@google/generative-ai': [{ skill: 'Gemini API', weight: 0.9 }],
  openai: [{ skill: 'OpenAI API', weight: 0.9 }],
};

const FRAMEWORK_SKILLS = {
  express: 'Express.js',
  'express.js': 'Express.js',
  expressjs: 'Express.js',
  react: 'React',
  'react.js': 'React',
  reactjs: 'React',
  'mongodb/mongoose': 'Mongoose',
  mongoose: 'Mongoose',
  mongodb: 'MongoDB',
  'jwt auth': 'JWT Authentication',
  'jwt authentication': 'JWT Authentication',
  swagger: 'Swagger',
  openapi: 'Swagger',
  docker: 'Docker',
  'docker compose': 'Docker Compose',
  'docker-compose': 'Docker Compose',
};

const CAREER_SKILLS = {
  'backend developer': 'Backend Development',
  'backend development': 'Backend Development',
  'frontend developer': 'Frontend Development',
  'frontend development': 'Frontend Development',
  'fullstack developer': 'Fullstack Development',
  'full stack developer': 'Fullstack Development',
  'fullstack development': 'Fullstack Development',
  'software engineer': 'Software Engineering',
};

const toArray = (value) => (Array.isArray(value) ? value : []);
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

const getInputName = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  return String(value.name || value.skill || value.packageName || value.path || value.fileName || '').trim();
};

const normalizeSkillNameForVector = (skillName) =>
  normalizeSkillText(canonicalizeSkillName(skillName));

const createEvidence = ({
  skill,
  source,
  sourceValue = '',
  weight = 0,
  confidence = 0.7,
  note = '',
}) => {
  const canonicalSkillName = canonicalizeSkillName(skill);
  if (!canonicalSkillName) return null;

  return {
    skill: canonicalSkillName,
    canonicalSkillName,
    normalizedSkillName: normalizeSkillNameForVector(canonicalSkillName),
    category: getCanonicalSkillCategory(canonicalSkillName),
    source,
    sourceValue: String(sourceValue || '').trim(),
    weight: clamp01(weight),
    confidence: clamp01(confidence),
    note: String(note || '').trim(),
  };
};

const pushEvidence = (target, options) => {
  const evidence = createEvidence(options);
  if (evidence) target.push(evidence);
};

const buildConfigEvidence = (configs, evidence) => {
  for (const value of configs) {
    const config = getInputName(value);
    const normalized = config.toLowerCase().replace(/\\/g, '/');
    if (!normalized) continue;

    if (normalized.includes('docker-compose') || normalized.includes('docker compose')) {
      pushEvidence(evidence, { skill: 'Docker Compose', source: 'config', sourceValue: config, weight: 0.8, confidence: 0.9, note: `Detected config: ${config}` });
    } else if (normalized.includes('dockerfile') || normalized === 'docker') {
      pushEvidence(evidence, { skill: 'Docker', source: 'config', sourceValue: config, weight: 0.7, confidence: 0.9, note: `Detected config: ${config}` });
    }

    if (normalized.includes('.github/workflows') || normalized.includes('github actions')) {
      pushEvidence(evidence, { skill: 'GitHub Actions', source: 'config', sourceValue: config, weight: 0.8, confidence: 0.9, note: `Detected workflow config: ${config}` });
      pushEvidence(evidence, { skill: 'CI/CD', source: 'config', sourceValue: config, weight: 0.7, confidence: 0.85, note: `Detected CI/CD workflow: ${config}` });
    }
    if (normalized.includes('.env.example') || normalized === 'env example') {
      pushEvidence(evidence, { skill: 'Environment Variables', source: 'config', sourceValue: config, weight: 0.6, confidence: 0.9, note: `Detected environment config: ${config}` });
    }
    if (normalized.includes('swagger') || normalized.includes('openapi')) {
      pushEvidence(evidence, { skill: 'Swagger', source: 'config', sourceValue: config, weight: 0.75, confidence: 0.85, note: `Detected API documentation config: ${config}` });
    }
    if (normalized.includes('eslint')) {
      pushEvidence(evidence, { skill: 'Linting', source: 'config', sourceValue: config, weight: 0.7, confidence: 0.9, note: `Detected linting config: ${config}` });
    }
    if (normalized.includes('prettier')) {
      pushEvidence(evidence, { skill: 'Formatting', source: 'config', sourceValue: config, weight: 0.7, confidence: 0.9, note: `Detected formatting config: ${config}` });
    }
    if (normalized.includes('vercel.json')) {
      pushEvidence(evidence, { skill: 'Vercel Deployment', source: 'config', sourceValue: config, weight: 0.75, confidence: 0.9, note: `Detected deployment config: ${config}` });
    }
    if (normalized.includes('render.yaml') || normalized.includes('render.yml') || normalized === 'render') {
      pushEvidence(evidence, { skill: 'Render Deployment', source: 'config', sourceValue: config, weight: 0.75, confidence: 0.9, note: `Detected deployment config: ${config}` });
    }
  }
};

const buildChecklistEvidence = (checklist, evidence) => {
  const mappings = [
    ['hasDocker', 'Docker', 0.7],
    ['hasDockerCompose', 'Docker Compose', 0.8],
    ['hasTesting', 'Testing', 0.75],
    ['hasLinting', 'Linting', 0.7],
    ['hasFormatter', 'Formatting', 0.7],
    ['hasEnvExample', 'Environment Variables', 0.6],
  ];

  for (const [key, skill, weight] of mappings) {
    if (checklist[key] === true) {
      pushEvidence(evidence, { skill, source: 'checklist', sourceValue: key, weight, confidence: 0.85, note: `Analysis checklist confirmed ${skill}` });
    }
  }

  if (checklist.hasCICD === true) {
    pushEvidence(evidence, { skill: 'CI/CD', source: 'checklist', sourceValue: 'hasCICD', weight: 0.75, confidence: 0.85, note: 'Analysis checklist confirmed CI/CD' });
  }
};

const buildSkillEvidenceFromAnalysis = (analysisInput = {}) => {
  const input = analysisInput && typeof analysisInput === 'object' ? analysisInput : {};
  const evidence = [];

  for (const value of toArray(input.languages)) {
    const language = getInputName(value);
    const skill = LANGUAGE_SKILLS.get(language.toLowerCase());
    if (skill) {
      pushEvidence(evidence, { skill, source: 'language', sourceValue: language, weight: 0.7, confidence: 0.8, note: `Detected repository language: ${language}` });
    }
  }

  for (const value of toArray(input.frameworks)) {
    const framework = getInputName(value);
    const normalized = framework.toLowerCase();
    const skill = FRAMEWORK_SKILLS[normalized] || (isKnownSkill(framework) ? canonicalizeSkillName(framework) : '');
    if (skill) {
      pushEvidence(evidence, { skill, source: 'framework', sourceValue: framework, weight: 0.85, confidence: 0.9, note: `Detected framework: ${framework}` });
    }
  }

  for (const value of toArray(input.packages)) {
    const packageName = getInputName(value).toLowerCase();
    for (const mapping of PACKAGE_SKILLS[packageName] || []) {
      pushEvidence(evidence, { skill: mapping.skill, source: 'package', sourceValue: packageName, weight: mapping.weight, confidence: 0.9, note: `Detected package: ${packageName}` });
    }
  }

  buildConfigEvidence(toArray(input.configs), evidence);

  for (const value of toArray(input.skillSignals)) {
    const signal = getInputName(value);
    if (isKnownSkill(signal)) {
      pushEvidence(evidence, { skill: signal, source: 'skill_signal', sourceValue: signal, weight: 0.7, confidence: 0.7, note: `Detected skill signal: ${signal}` });
    }
  }

  for (const value of toArray(input.careerSignals)) {
    const signal = getInputName(value);
    const skill = CAREER_SKILLS[signal.toLowerCase()] || (isKnownSkill(signal) ? canonicalizeSkillName(signal) : '');
    if (skill) {
      pushEvidence(evidence, { skill, source: 'career_signal', sourceValue: signal, weight: 0.6, confidence: 0.7, note: `Detected career signal: ${signal}` });
    }
  }

  buildChecklistEvidence(input.checklist && typeof input.checklist === 'object' ? input.checklist : {}, evidence);

  for (const value of toArray(input.missingSkills)) {
    const missingSkill = getInputName(value);
    if (isKnownSkill(missingSkill)) {
      pushEvidence(evidence, { skill: missingSkill, source: 'missing_signal', sourceValue: missingSkill, weight: 0, confidence: 0.8, note: 'Detected as missing skill in analysis' });
    }
  }

  return evidence;
};

const getSkillLevel = (score) => {
  const normalizedScore = clamp01(score);
  if (normalizedScore === 0) return 'missing';
  if (normalizedScore < 0.4) return 'weak';
  if (normalizedScore < 0.7) return 'developing';
  return 'strong';
};

const buildSkillVectorFromEvidence = (skillEvidence) => {
  const grouped = new Map();

  for (const item of toArray(skillEvidence)) {
    if (!item || typeof item !== 'object') continue;
    const canonicalSkillName = canonicalizeSkillName(item.canonicalSkillName || item.skill);
    if (!canonicalSkillName) continue;

    if (!grouped.has(canonicalSkillName)) grouped.set(canonicalSkillName, []);
    grouped.get(canonicalSkillName).push(item);
  }

  const calculatedAt = new Date();
  return [...grouped.entries()]
    .map(([canonicalSkillName, items]) => {
      const positiveItems = items.filter((item) => item.source !== 'missing_signal' && clamp01(item.weight) > 0);
      const remainingProbability = positiveItems.reduce(
        (product, item) => product * (1 - clamp01(item.weight) * clamp01(item.confidence)),
        1
      );
      const score = Number(clamp01(1 - remainingProbability).toFixed(4));

      return {
        skill: canonicalSkillName,
        canonicalSkillName,
        normalizedSkillName: normalizeSkillNameForVector(canonicalSkillName),
        category: getCanonicalSkillCategory(canonicalSkillName),
        score,
        level: getSkillLevel(score),
        evidence: uniqueStrings(items.map((item) => item.note || item.sourceValue)),
        sources: uniqueStrings(items.map((item) => item.source)),
        lastCalculatedAt: calculatedAt,
      };
    })
    .sort((a, b) => b.score - a.score || a.canonicalSkillName.localeCompare(b.canonicalSkillName));
};

const buildSkillVectorFromAnalysis = (analysisInput = {}) => {
  const skillEvidence = buildSkillEvidenceFromAnalysis(analysisInput);
  return {
    skillEvidence,
    skillVector: buildSkillVectorFromEvidence(skillEvidence),
  };
};

module.exports = {
  buildSkillEvidenceFromAnalysis,
  buildSkillVectorFromEvidence,
  buildSkillVectorFromAnalysis,
  getSkillLevel,
  normalizeSkillNameForVector,
};
