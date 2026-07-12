const crypto = require('crypto');

const EVIDENCE_VERSION = 'contribution-code-evidence-v3';
const FILE_SELECTION_VERSION = 'commit-file-selection-all-eligible-v1';
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.py', '.java', '.cs', '.go', '.rb', '.php', '.dart', '.swift', '.kt', '.kts', '.css', '.scss', '.html', '.json', '.yml', '.yaml', '.toml', '.tf']);
const APP_SOURCE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.py', '.java', '.cs', '.go', '.rb', '.php', '.dart', '.swift', '.kt', '.kts']);
const STYLE_EXTENSIONS = new Set(['.css', '.scss']);
const CONFIG_EXTENSIONS = new Set(['.json', '.yml', '.yaml', '.toml', '.tf']);
const IGNORED_PATH = /(^|\/)(\.agents|docs|node_modules|dist|build|coverage|vendor|generated|\.git)(\/|$)|(^|\/)(readme|changelog|license)[^/]*$|(^|\/)(admin_web_handoff\.md|skills-lock\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.(?:md|map|min\.(?:js|css)|png|jpe?g|gif|webp|svg|ico|bmp|avif|woff2?|ttf|otf|eot|zip|tar|gz|tgz|rar|7z|pdf|exe|dll|so|dylib|bin)$/i;
const IMPORTANT_PATH = /(^|\/)(components?|pages?|features?|routes?|hooks?|stores?|models?|controllers?|tests?|__tests__)(\/|$)|(^|\/)src\/styles\/|(^|\/)src\/main\.(tsx|jsx|ts|js)$/i;
const TEST_PATH = /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\.[^.]+$/i;
const CONFIG_PATH = /(^|\/)(package\.json|vite\.config\.[^.]+|tailwind\.config\.[^.]+|postcss\.config\.[^.]+|tsconfig[^/]*\.json|dockerfile|docker-compose\.[^.]+|\.github\/workflows\/[^/]+|\.gitlab-ci\.yml|jenkinsfile|kubernetes\/|k8s\/|terraform\/)|\.(?:tf|toml)$/i;

const extensionOf = (filename = '') => {
  const match = String(filename).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] || '';
};

const isEligibleContributionFile = (filename = '') => {
  const path = String(filename).replace(/\\/g, '/');
  return Boolean(path) && !IGNORED_PATH.test(path) && (SOURCE_EXTENSIONS.has(extensionOf(path)) || /(^|\/)(dockerfile|\.env\.example)$/i.test(path));
};

const contributionFileGroup = (filename = '') => {
  const path = String(filename || '').replace(/\\/g, '/');
  const ext = extensionOf(path);
  if (TEST_PATH.test(path)) return 'test';
  if (STYLE_EXTENSIONS.has(ext)) return 'style';
  if (CONFIG_PATH.test(path) || CONFIG_EXTENSIONS.has(ext) && !APP_SOURCE_EXTENSIONS.has(ext)) return 'config';
  return 'source';
};

const contributionFilePriority = (file = {}) => {
  const path = String(file.filename || file.path || '').replace(/\\/g, '/');
  const ext = extensionOf(path);
  if (/^src\//i.test(path) && ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'].includes(ext)) return 0;
  if (TEST_PATH.test(path)) return 1;
  if (STYLE_EXTENSIONS.has(ext) || CONFIG_PATH.test(path)) return 2;
  if (APP_SOURCE_EXTENSIONS.has(ext)) return 3;
  return 4;
};

const contributionFileScore = (file = {}) => {
  const path = String(file.filename || file.path || '').replace(/\\/g, '/');
  let score = 0;
  if (file.patch) score += 1000;
  if (Number(file.additions || 0) > 0) score += 500;
  score += Math.min(Number(file.changes || 0), 500);
  if (IMPORTANT_PATH.test(path)) score += 250;
  if (/^src\/(components?|features?|pages?|routes?)\//i.test(path)) score += 300;
  if (/^src\/styles\//i.test(path) || /^src\/main\.(tsx|jsx|ts|js)$/i.test(path)) score += 275;
  if (/(^|\/)(package\.json|vite\.config\.[^.]+|tailwind\.config\.[^.]+)$/i.test(path)) score += 275;
  return score;
};

const selectContributionCodeEvidenceFiles = (files = [], maxFiles = 0) => {
  const sourceFiles = Array.isArray(files) ? files : [];
  const eligible = sourceFiles
    .filter((file) => isEligibleContributionFile(file.filename || file.path))
    .map((file, index) => ({
      ...file,
      evidenceGroup: contributionFileGroup(file.filename || file.path),
      evidencePriority: contributionFilePriority(file),
      evidenceScore: contributionFileScore(file),
      evidenceOriginalIndex: index,
    }))
    .sort((a, b) => (
      a.evidencePriority - b.evidencePriority
      || b.evidenceScore - a.evidenceScore
      || Number(Boolean(b.patch)) - Number(Boolean(a.patch))
      || Number(b.additions || 0) - Number(a.additions || 0)
      || Number(b.changes || 0) - Number(a.changes || 0)
      || a.evidenceOriginalIndex - b.evidenceOriginalIndex
    ));

  const normalizedMax = Number(maxFiles || 0);
  const selected = normalizedMax > 0 ? eligible.slice(0, normalizedMax) : eligible;
  const groupCounts = selected.reduce((counts, file) => {
    const group = file.evidenceGroup || 'source';
    counts[group] = (counts[group] || 0) + 1;
    return counts;
  }, { source: 0, test: 0, style: 0, config: 0 });

  return {
    selected,
    metadata: {
      fileSelectionVersion: FILE_SELECTION_VERSION,
      eligibleFiles: eligible.length,
      ignoredFiles: Math.max(0, sourceFiles.length - eligible.length),
      selectedFiles: selected.length,
      groupCounts,
      countLimitApplied: normalizedMax > 0,
    },
  };
};

const addedPatchText = (patch = '', maxChars = 12000) => String(patch || '')
  .split(/\r?\n/)
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n')
  .slice(0, maxChars);

const push = (set, value, condition) => { if (condition) set.add(value); };

const parseContributionCodeEvidence = ({ filename, content = '', evidenceSource = 'path_only', file = {} } = {}) => {
  const path = String(filename || '').replace(/\\/g, '/');
  const lowerPath = path.toLowerCase();
  const text = String(content || '').slice(0, 50000);
  const lower = text.toLowerCase();
  const languages = new Set();
  const frameworks = new Set();
  const libraries = new Set();
  const patterns = new Set();
  const roles = new Set();
  const skills = new Set();
  const ext = extensionOf(path);

  push(languages, 'typescript', ['.ts', '.tsx'].includes(ext));
  push(languages, 'javascript', ['.js', '.jsx'].includes(ext));
  push(languages, 'python', ext === '.py');
  push(languages, 'dart', ext === '.dart');

  const backendServer = /from\s+['"]express['"]|require\(['"]express['"]\)|express\.router|router\.(get|post|put|patch|delete)|app\.(get|post|put|patch|delete)|@controller\b|from\s+['"]@nestjs|fastify\(|koa\(/i.test(text);
  const database = /mongoose|prisma|sequelize|typeorm|mongodb|postgres|mysql|schema\.prisma/i.test(text);
  const mobile = /react-native|from\s+['"]expo|@react-navigation|flutter\/material|androidmanifest|uikit/i.test(text)
    || /(^|\/)(android|ios|screens|navigation)\//.test(lowerPath);
  const frontendTest = TEST_PATH.test(path) && /testing-library|vitest|jest|cypress|playwright|render\(|describe\(|it\(|expect\(/i.test(text);
  const responsive = /@media|sm:|md:|lg:|xl:|grid-cols|flex-wrap|responsive|breakpoint|container-query|clamp\(/i.test(text);
  const frontend = !mobile && !backendServer && (/\.(tsx|jsx|vue|svelte|css|scss)$/.test(lowerPath)
    || /from\s+['"]react['"]|react-dom|react-router-dom|usest(?:ate|effect)|usememo|usecontext|tailwind|classname/i.test(text)
    || /(^|\/)(pages|components|hooks|routes|styles)\//.test(lowerPath)
    || frontendTest);

  if (frontend) {
    roles.add('frontend');
    push(frameworks, 'react', /from\s+['"]react['"]|react-dom|\.tsx$|\.jsx$/i.test(text) || /\.(tsx|jsx)$/.test(lowerPath));
    push(frameworks, 'vite', /vite|vite\.config/.test(lower));
    push(libraries, 'react-router-dom', /react-router-dom|browserrouter|<route/i.test(text));
    push(libraries, 'axios', /from\s+['"]axios['"]|axios\.(get|post|put|patch|delete)|axios\.create/i.test(text));
    push(patterns, 'frontend_component', /\.(tsx|jsx|vue|svelte)$/.test(lowerPath) || /function\s+[A-Z]|=>\s*</.test(text));
    push(patterns, 'frontend_routing', /react-router-dom|browserrouter|<route/i.test(text) || /(^|\/)routes\//.test(lowerPath));
    push(patterns, 'frontend_api_client', /from\s+['"]axios['"]|require\(['"]axios['"]\)|axios\.|fetch\s*\(|baseurl|interceptor/i.test(text));
    push(patterns, 'frontend_state', /usestate|usecontext|redux|zustand|pinia/i.test(lower));
    push(patterns, 'frontend_style', /tailwind|classname|\.css$|\.scss$/i.test(text) || /\.(css|scss)$/.test(lowerPath));
    push(patterns, 'frontend_testing', frontendTest);
    push(patterns, 'frontend_responsive', responsive);
    push(skills, 'React', frameworks.has('react'));
    push(skills, 'React UI', frameworks.has('react'));
    push(skills, 'Component Design', patterns.has('frontend_component'));
    push(skills, 'Frontend Routing', patterns.has('frontend_routing'));
    push(skills, 'API Integration', patterns.has('frontend_api_client'));
    push(skills, 'State Management', patterns.has('frontend_state'));
    push(skills, 'Frontend Testing', patterns.has('frontend_testing'));
    push(skills, 'Responsive Design', patterns.has('frontend_responsive'));
  }
  if (backendServer || database) {
    roles.add('backend');
    push(frameworks, 'express', /express/i.test(text));
    push(frameworks, 'nestjs', /@nestjs|@controller/i.test(text));
    push(libraries, 'mongoose', /mongoose/i.test(text));
    push(libraries, 'prisma', /prisma/i.test(text));
    push(patterns, 'backend_route', backendServer);
    push(patterns, 'backend_database', database);
    push(skills, 'REST API', backendServer);
    push(skills, 'Database', database);
  }
  if (mobile) { roles.add('mobile'); patterns.add('mobile_source'); }
  if (/dockerfile|docker-compose|github\/workflows|terraform|kubernetes|apiVersion:\s*apps/i.test(`${path}\n${text}`)) { roles.add('devops'); patterns.add('devops'); }
  if (/import\s+pandas|from\s+sklearn|tensorflow|torch|model\.fit|\.ipynb/i.test(text)) { roles.add('data'); patterns.add('data_ml'); }

  return {
    filename: path,
    status: file.status || '',
    additions: Number(file.additions || 0),
    deletions: Number(file.deletions || 0),
    changes: Number(file.changes || 0),
    evidenceSource,
    detectedLanguages: [...languages],
    detectedFrameworks: [...frameworks],
    detectedLibraries: [...libraries],
    detectedPatterns: [...patterns],
    detectedRoleSignals: [...roles],
    skillSignals: [...skills],
    contentHash: text ? crypto.createHash('sha256').update(text).digest('hex') : '',
    analyzedAt: new Date(),
    evidenceVersion: EVIDENCE_VERSION,
    fileSelectionVersion: FILE_SELECTION_VERSION,
  };
};

module.exports = {
  EVIDENCE_VERSION,
  FILE_SELECTION_VERSION,
  addedPatchText,
  contributionFileGroup,
  isEligibleContributionFile,
  parseContributionCodeEvidence,
  selectContributionCodeEvidenceFiles,
};
