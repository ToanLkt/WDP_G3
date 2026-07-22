const fs = require('fs');
const path = require('path');

const { DEV2VEC_ROLES, DEV2VEC_SKILLS } = require('../src/constants/dev2vecCatalog');
const { LEGACY_CANONICAL_SKILLS } = require('../src/constants/canonicalSkills');
const { normalizeSkillText } = require('../src/utils/skillCanonicalizer');
const prototypes = require('../ml_service/artifacts/skill_prototypes.json');
const modelMetadata = require('../ml_service/artifacts/model_metadata.json');
const pipelineMetadata = require('../src/services/dev2vec/dev2vecPipelineMetadata.service').getCurrentDev2VecPipelineMetadata();

const ROOT = path.resolve(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'coursera-skill-crawl-plan.json');
const MD_PATH = path.join(ROOT, 'docs', 'COURSERA_SKILL_CRAWL_AUDIT.md');
const GENERATED_AT = '2026-07-23T00:00:00+07:00';

const skillMeta = {
  'REST API': ['P0', 'REST API design and development', ['RESTful API development', 'Web API design'], ['restaurant', 'real estate'], 'CRAWL_REQUIRED'],
  Database: ['P0', 'database fundamentals SQL and NoSQL', ['database design and management', 'relational and NoSQL databases'], ['biological database'], 'CRAWL_REQUIRED'],
  Authentication: ['P0', 'web authentication and authorization', ['JWT OAuth authentication', 'application identity and access control'], ['biometric hardware'], 'CRAWL_REQUIRED'],
  'Docker Basics': ['P0', 'Docker containers for beginners', ['Docker fundamentals', 'containerization with Docker'], ['Kubernetes only'], 'CRAWL_REQUIRED'],
  'API Testing': ['P0', 'REST API testing', ['automated API testing', 'integration testing web APIs'], ['manual testing only'], 'CRAWL_REQUIRED'],
  'React UI': ['P0', 'React JavaScript user interfaces', ['React component development', 'React web development'], ['React Native only'], 'CRAWL_REQUIRED'],
  'Component Design': ['P1', 'frontend UI component design', ['reusable React components', 'web design systems components'], ['electronic components'], 'CRAWL_REQUIRED'],
  'State Management': ['P1', 'frontend state management', ['React Redux state management', 'application state architecture'], ['government state management'], 'CRAWL_REQUIRED'],
  'Frontend Testing': ['P1', 'frontend web application testing', ['React component testing', 'JavaScript UI testing'], ['backend testing only'], 'CRAWL_REQUIRED'],
  'Responsive Design': ['P1', 'responsive web design', ['mobile-first web design', 'CSS responsive layouts'], ['responsive leadership'], 'CRAWL_REQUIRED'],
  'Mobile UI': ['P1', 'mobile application UI design and development', ['mobile interface development', 'mobile app user experience'], ['mobile hardware repair'], 'CRAWL_REQUIRED'],
  Navigation: ['P2', 'mobile app navigation', ['React Native navigation', 'mobile navigation architecture'], ['GPS navigation', 'maritime navigation'], 'CRAWL_OPTIONAL'],
  'Local Storage': ['P2', 'mobile app local data storage', ['offline mobile data persistence', 'SQLite mobile storage'], ['warehouse storage', 'cloud storage administration'], 'CRAWL_OPTIONAL'],
  'API Integration': ['P1', 'mobile application API integration', ['REST API client development', 'HTTP API integration for apps'], ['systems integration overview only'], 'CRAWL_REQUIRED'],
  'App State Management': ['P2', 'mobile app state management', ['React Native state management', 'Flutter application state management'], ['government state management'], 'CRAWL_OPTIONAL'],
  Docker: ['P0', 'Docker containerization', ['Docker containers', 'Docker development workflows'], ['Kubernetes only', 'certification exam only'], 'CRAWL_REQUIRED'],
  Kubernetes: ['P0', 'Kubernetes container orchestration', ['Kubernetes fundamentals', 'Kubernetes application deployment'], ['Docker only'], 'CRAWL_REQUIRED'],
  'CI/CD': ['P0', 'continuous integration and continuous delivery', ['CI/CD pipelines', 'DevOps build test deploy automation'], ['marketing pipeline'], 'CRAWL_REQUIRED'],
  'Infrastructure as Code': ['P1', 'infrastructure as code with Terraform', ['IaC fundamentals', 'Terraform and Ansible automation'], ['building architecture'], 'CRAWL_REQUIRED'],
  Monitoring: ['P1', 'software observability and monitoring', ['application monitoring with Prometheus and Grafana', 'DevOps metrics logs and alerts'], ['health monitoring', 'environmental monitoring'], 'CRAWL_REQUIRED'],
  'Data Analysis': ['P0', 'data analysis with Python', ['exploratory data analysis', 'data analysis with Pandas'], ['business overview only'], 'CRAWL_REQUIRED'],
  'Machine Learning': ['P0', 'machine learning', ['applied machine learning with Python', 'supervised and unsupervised learning'], ['hardware machine maintenance'], 'CRAWL_REQUIRED'],
  'Model Training': ['P1', 'machine learning model training and evaluation', ['feature engineering and model validation', 'hyperparameter tuning machine learning'], ['fitness training', 'fashion model'], 'CRAWL_REQUIRED'],
  'Data Visualization': ['P1', 'data visualization with Python', ['Matplotlib and Seaborn data visualization', 'visual analytics'], ['architectural visualization'], 'CRAWL_REQUIRED'],
  'NLP Basics': ['P2', 'natural language processing fundamentals', ['NLP with Python', 'text processing and classification'], ['neuro linguistic programming'], 'CRAWL_OPTIONAL'],
};

const slug = (value) => normalizeSkillText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const quote = (values) => values.join('; ');
const activeNames = new Set(DEV2VEC_SKILLS.map((skill) => skill.name));
const rolesBySkill = new Map();
DEV2VEC_ROLES.forEach((role) => role.skills.forEach((name) => {
  if (!rolesBySkill.has(name)) rolesBySkill.set(name, []);
  rolesBySkill.get(name).push(role.roleId);
}));

const aliases = {};
for (const skill of DEV2VEC_SKILLS) {
  for (const alias of skill.aliases) {
    const key = normalizeSkillText(alias);
    if (key && !aliases[key]) aliases[key] = slug(skill.name);
  }
}

const skills = DEV2VEC_SKILLS.map((skill) => {
  const [priority, primary, alternatives, negativeKeywords, status] = skillMeta[skill.name];
  return {
    skillId: slug(skill.name),
    canonicalName: skill.name,
    aliases: [...new Set(skill.aliases)].sort((a, b) => a.localeCompare(b)),
    sourceTypes: ['dev2vec_skill_prototype', 'dev2vec_role_catalog', 'python_skill_gap', 'roadmap_skill_gap', 'learning_canonicalization'],
    roles: (rolesBySkill.get(skill.name) || []).sort(),
    canAppearInPythonSkillGap: true,
    canAppearInRoadmap: true,
    hasLearningConsumer: true,
    existingYouTubeSupport: true,
    priority,
    status,
    queries: {
      primary,
      alternatives,
      negativeKeywords,
      preferredContentTypes: ['course', 'specialization', 'guided_project'],
      preferredLevels: priority === 'P2' ? ['beginner'] : ['beginner', 'intermediate'],
    },
    limits: {
      maxCourses: priority === 'P0' ? 8 : priority === 'P1' ? 5 : 3,
      contentTypes: ['course', 'specialization', 'guided_project'],
    },
  };
}).sort((a, b) => a.skillId.localeCompare(b.skillId));

const excludedSkills = LEGACY_CANONICAL_SKILLS.map((skill) => ({
  name: skill.name,
  classification: activeNames.has(skill.name) ? 'DO_NOT_CRAWL' : 'LEGACY',
  reason: activeNames.has(skill.name)
    ? 'Duplicate legacy catalog entry; the Dev2Vec entry wins canonical lookup.'
    : 'Legacy role/vector/shared-canonical catalog only; cannot occur in the current Python v4 skill gap.',
})).sort((a, b) => a.name.localeCompare(b.name));

const plan = {
  version: 'coursera-skill-crawl-plan-v1',
  generatedAt: GENERATED_AT,
  sourceVersions: {
    modelVersion: modelMetadata.modelVersion,
    pipelineVersion: pipelineMetadata.analysisPipelineVersion,
    skillPrototypeCount: prototypes.length,
  },
  policy: {
    authoritativeSource: 'ml_service/artifacts/skill_prototypes.json mirrored by src/constants/dev2vecCatalog.js',
    scope: 'Current Python skill-gap skills that can be enforced into main-path roadmap tasks and consumed by learning APIs.',
    excludesRepositoryPackages: true,
    excludesTestOnlySkills: true,
    allowsNetwork: false,
  },
  skills,
  aliases: Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b))),
  excludedSkills,
};

const counts = {
  definitions: DEV2VEC_SKILLS.length + LEGACY_CANONICAL_SKILLS.length,
  canonical: skills.length,
  aliases: Object.keys(aliases).length,
  P0: skills.filter((skill) => skill.priority === 'P0').length,
  P1: skills.filter((skill) => skill.priority === 'P1').length,
  P2: skills.filter((skill) => skill.priority === 'P2').length,
  excluded: excludedSkills.length,
  manual: 0,
};

const sourceRows = [
  ['Python prototypes', '`ml_service/artifacts/skill_prototypes.json`; `evaluate_skill_gaps.py`', 'Yes', '25 authoritative names; emitted as matched/weak/missing/recommended.'],
  ['Node Dev2Vec catalog', '`src/constants/dev2vecCatalog.js`', 'Yes', 'Runtime mirror used by role and skill catalog APIs.'],
  ['Roadmap gap', '`roadmapSkillGap.service.js#buildDev2VecSkillGapContext`', 'Yes', 'Consumes the selected source analysis and Python gap.'],
  ['Roadmap enforcement', '`roadmap.service.js#enforceMainRoadmapDev2VecSkills`', 'Yes', 'Rewrites every main-path task to the authoritative gap allow-list.'],
  ['Learning canonicalizer', '`canonicalSkills.js`; `skillCanonicalizer.js`', 'Yes', 'Dev2Vec entries are ordered first; unknown text passes through unchanged.'],
  ['Learning/YouTube', '`roadmapLearning.service.js`; `learning.service.js#searchAndCacheYoutubeResources`', 'Yes', 'Queries and persists by canonical skill, role, level and language.'],
  ['Legacy role vectors', '`src/constants/roleSkillVectors.js`', 'No for v12 roadmap authority', 'Active role-matching compatibility/catalog code, but cannot override Python v4 gaps.'],
  ['Repository packages/chat', '`RepositoryPackage`; roadmap/chat context builders', 'No', 'Examples/technical context only; explicitly forbidden as personal skill evidence.'],
];

const inventoryRows = skills.map((skill) => `| ${skill.canonicalName} | ${quote(skill.roles)} | Yes | Yes | Yes | ${skill.priority} | ${skill.status} |`).join('\n');
const aliasRows = Object.entries(plan.aliases).map(([alias, id]) => `| ${alias} | ${skills.find((skill) => skill.skillId === id)?.canonicalName || id} |`).join('\n');
const queryRows = skills.map((skill) => `| ${skill.canonicalName} | ${skill.queries.primary} | ${quote(skill.queries.alternatives)} | ${quote(skill.queries.negativeKeywords)} |`).join('\n');
const roleRows = DEV2VEC_ROLES.map((role) => `| ${role.roleName} | ${role.skills.join(', ')} |`).join('\n');
const group = (priority) => skills.filter((skill) => skill.priority === priority).map((skill) => skill.canonicalName).join(', ');

const markdown = `# Coursera Skill Crawl Audit

Generated deterministically from the repository at audit date 2026-07-23. This audit did not access Coursera or any network service.

## 1. Executive Summary

- Skill definitions found across current and legacy canonical catalogs: **${counts.definitions}** (${DEV2VEC_SKILLS.length} Dev2Vec + ${LEGACY_CANONICAL_SKILLS.length} legacy entries).
- Current canonical crawl inventory: **${counts.canonical}**.
- Active normalized aliases: **${counts.aliases}**.
- Priority split: **P0 ${counts.P0} / P1 ${counts.P1} / P2 ${counts.P2}**.
- Excluded legacy/duplicate entries: **${counts.excluded}**.
- Manual-review blockers: **${counts.manual}**. Broad/ambiguous names are retained only with contextual queries.

## 2. Skill Sources

| Source | File/function | Active | Notes |
| --- | --- | ---: | --- |
${sourceRows.map((row) => `| ${row.join(' | ')} |`).join('\n')}

## 3. Source-of-truth Decision

The authoritative taxonomy is the 25 prototypes in \`ml_service/artifacts/skill_prototypes.json\`, mirrored exactly by \`DEV2VEC_SKILLS\`. Python assigns their statuses and recommendations. A roadmap is bound to one compatible v12 source analysis and \`enforceMainRoadmapDev2VecSkills\` restricts main-path tasks to that analysis's gap names. The 69-entry \`LEGACY_CANONICAL_SKILLS\` list supports older role/vector and learning inputs but is not allowed to expand this crawl.

The canonicalizer lowercases, trims, converts hyphens/dashes to spaces and collapses whitespace. It does not remove punctuation, strip versions, or reject unknown skills. Lookup is first-match-wins, so Dev2Vec aliases shadow later legacy entries. No current prototype is versioned.

## 4. Canonical Skill Inventory

| Skill | Roles | Python gap | Roadmap | Learning | Priority | Crawl status |
| --- | --- | ---: | ---: | ---: | --- | --- |
${inventoryRows}

## 5. Alias Mapping

Aliases are normalization inputs only and are never separate crawl jobs. There are ${counts.aliases} unique normalized active aliases.

| Alias | Canonical |
| --- | --- |
${aliasRows}

## 6. Skills to Crawl

### P0

${group('P0')}

### P1

${group('P1')}

### P2

${group('P2')}

## 7. Skills Not to Crawl

All ${counts.excluded} legacy catalog entries are listed machine-readably in the JSON. Eight are duplicate names shadowed by Dev2Vec entries; the remainder cannot appear in the current Python gap. Test fixtures such as Accessibility, Documentation, Clean Code and Project Setup do not enter the official list unless a current Python prototype is added in a future model generation.

RepositoryPackage dependencies, README technologies, teammate contributions, chat technical context and test-only strings are explicitly excluded.

## 8. Broad/Ambiguous Skills

- Database uses “database fundamentals SQL and NoSQL”, not the raw broad word.
- Navigation, Local Storage and App State Management are qualified with mobile-app context.
- Monitoring is qualified with software observability; Component Design with frontend UI.
- NLP Basics expands NLP to natural language processing to avoid neuro-linguistic-programming noise.
- Docker Basics and Docker remain separate because the backend currently models them as separate role-specific prototypes; they may deduplicate the same returned URL at persistence time.

## 9. Coursera Search Query Plan

| Skill | Primary query | Alternatives | Negative terms |
| --- | --- | --- | --- |
${queryRows}

## 10. Existing YouTube Alignment

The learning flow canonicalizes \`skillName\`, builds a query from canonical skill + task title + role + level, then keys persisted resources by canonical skill, target role, level, language and type. Coursera can reuse the canonicalization and relevance concepts, but should use the curated contextual primary queries in this plan rather than the raw YouTube default for broad names. YouTube has no durable historical “all queried skills” inventory in code; database rows would be required for that operational count.

## 11. Role Coverage Matrix

| Role | Required crawl skills |
| --- | --- |
${roleRows}

## 12. Roadmap Coverage

**100% (25/25)** of the current Dev2Vec prototype/role catalog has a classified Coursera plan. Main-path roadmap coverage is therefore 100% for any valid current Python gap. Supporting/legacy paths are outside this guarantee and intentionally excluded.

## 13. Recommended Crawl Limits

- P0: up to 8 direct courses/skill (within requested 5–10).
- P1: up to 5 direct courses/skill (within requested 3–5).
- P2: up to 3 direct courses/skill (within requested 1–3).
- Accept course, specialization and guided project; persist only verified direct course URLs and deduplicate URL + canonical skill.

## 14. Risks

- The Python artifact and Node mirror can drift; the local audit script fails if they do.
- Unknown text currently passes through canonicalization, but main-path enforcement contains it when a gap allow-list exists.
- Supporting paths and historical roadmaps may contain legacy/out-of-catalog skills and have no 25-skill coverage guarantee.
- Broad queries can return unrelated domains; contextual queries and negative terms are mandatory.
- Coursera URLs and availability can become stale; crawler/persistence must revalidate independently.
- Docker Basics and Docker overlap semantically but cannot be merged without changing the model/contract.

## 15. Final Crawl Recommendation

Use exactly the 25 entries in \`data/coursera-skill-crawl-plan.json\`. Crawl P0 first, then P1, then P2. Do not derive jobs from whole-repository packages, legacy role vectors, README/chat context, tests, or arbitrary LLM output. No production API, model artifact, FE contract, roadmap logic or learning logic was changed by this audit.
`;

const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(prototypes.length === DEV2VEC_SKILLS.length, 'Prototype/catalog count mismatch');
assert(prototypes.every((item) => activeNames.has(item.canonicalSkillName)), 'Unclassified Python prototype');
assert(skills.every((item) => item.status && item.queries.primary), 'Skill missing classification/query');
assert(new Set(skills.map((item) => item.skillId)).size === skills.length, 'Duplicate canonical skill ID');
assert(Object.values(aliases).every((id) => skills.some((skill) => skill.skillId === id)), 'Alias points to missing skill');
assert(skills.filter((item) => ['P0', 'P1'].includes(item.priority)).every((item) => item.queries.primary), 'P0/P1 missing primary query');
assert(skills.find((item) => item.canonicalName === 'NLP Basics').queries.primary.includes('natural language'), 'Ambiguous NLP query');
assert(plan.policy.excludesRepositoryPackages && plan.policy.excludesTestOnlySkills, 'Forbidden source policy missing');

fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
fs.writeFileSync(JSON_PATH, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
fs.writeFileSync(MD_PATH, markdown, 'utf8');
console.log(`PASS: ${skills.length} canonical skills, ${counts.aliases} aliases, P0/P1/P2=${counts.P0}/${counts.P1}/${counts.P2}`);
console.log(path.relative(ROOT, MD_PATH));
console.log(path.relative(ROOT, JSON_PATH));
