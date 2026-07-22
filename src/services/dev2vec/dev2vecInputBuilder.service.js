const crypto = require('crypto');
const { detectDocumentationEvidence } = require('../../utils/documentationEvidence');
const { parseSourceUsageEvidence } = require('./sourceUsageParser.service');
const { SOURCE_USAGE_PARSER_VERSION } = require('./dev2vecPipelineMetadata.service');
const { buildRepoDocument } = require('./repoDocumentBuilder.service');
const { buildApiEvidence } = require('./apiEvidenceBuilder.service');
const { buildAttributedIssueDocument } = require('./issueDocumentBuilder.service');

const DEFAULT_TOP_N = 3;
const DEFAULT_REPO_TEXT_LIMIT = 50000;
const DEFAULT_ISSUE_TEXT_LIMIT = 30000;
const DEFAULT_TOKEN_LIMIT = 100;
const DEFAULT_ISSUE_BODY_LIMIT = 1200;
const PREVIEW_LIMITS = {
  commits: 10,
  issues: 10,
  apiTokens: 30,
  changedFilesPerCommit: 10,
};
const SOURCE_LIMITS = {
  maxFilesTotal: 60,
  maxCharsPerFile: 2000,
  maxTotalSourceChars: 40000,
  maxDocsFiles: 15,
  maxMlServiceFiles: 8,
  maxScriptsFiles: 10,
};
const ROLE_CATEGORY_GROUPS = {
  backend: [
    'backend_route',
    'backend_controller',
    'backend_service',
    'backend_model',
    'backend_database',
    'backend_authentication',
    'backend_middleware',
    'backend_api',
    'backend_testing',
  ],
  frontend: [
    'frontend_component',
    'frontend_page',
    'frontend_hook',
    'frontend_state',
    'frontend_routing',
    'frontend_style',
    'frontend_asset',
    'frontend_config',
    'frontend_testing',
    'frontend_api_client',
  ],
  mobile: [
    'mobile_screen',
    'mobile_navigation',
    'mobile_widget',
    'mobile_state',
    'mobile_native_android',
    'mobile_native_ios',
    'mobile_config',
    'mobile_testing',
    'mobile_api_client',
  ],
  devops: [
    'devops_container',
    'devops_ci_cd',
    'devops_infrastructure',
    'devops_orchestration',
    'devops_cloud',
    'devops_monitoring',
    'devops_proxy',
    'devops_automation',
  ],
  data: [
    'data_notebook',
    'data_preprocessing',
    'data_analysis',
    'data_visualization',
    'data_ml_training',
    'data_model',
    'data_nlp',
    'data_cv',
    'data_pipeline',
    'data_experiment',
  ],
};
const CATEGORY_QUOTAS = {
  ...Object.fromEntries(Object.values(ROLE_CATEGORY_GROUPS).flat().map((category) => [category, { min: 0, max: 4 }])),
  documentation: { min: 1, max: 6 },
  testing: { min: 0, max: 4 },
  ml_service: { min: 0, max: 8 },
  config: { min: 0, max: 5 },
  generic_source: { min: 0, max: 8 },
};
const CATEGORY_PRIORITY = [
  'backend_route',
  'frontend_component',
  'mobile_screen',
  'devops_container',
  'data_notebook',
  'backend_controller',
  'frontend_page',
  'mobile_navigation',
  'devops_ci_cd',
  'data_ml_training',
  'backend_service',
  'frontend_hook',
  'mobile_widget',
  'devops_infrastructure',
  'data_preprocessing',
  'backend_model',
  'frontend_state',
  'mobile_state',
  'devops_orchestration',
  'data_model',
  'backend_database',
  'frontend_routing',
  'mobile_native_android',
  'devops_cloud',
  'data_analysis',
  'backend_authentication',
  'frontend_style',
  'mobile_native_ios',
  'devops_monitoring',
  'data_visualization',
  'backend_middleware',
  'frontend_asset',
  'mobile_config',
  'devops_proxy',
  'data_nlp',
  'backend_api',
  'frontend_config',
  'mobile_testing',
  'devops_automation',
  'data_cv',
  'backend_testing',
  'frontend_testing',
  'mobile_api_client',
  'data_pipeline',
  'frontend_api_client',
  'data_experiment',
  'documentation',
  'testing',
  'ml_service',
  'config',
  'generic_source',
];
const KEYWORDS_BY_CATEGORY = {
  backend_route: ['express.Router', 'router.get', 'router.post', '@Controller', 'Fastify', 'koa-router'],
  backend_controller: ['@Controller', 'req', 'res', 'Request', 'Response', 'controller'],
  backend_service: ['@Injectable', 'service', 'repository', 'business logic'],
  backend_model: ['mongoose.Schema', '@Entity', 'model', 'schema', 'entity'],
  backend_database: ['mongoose', 'prisma', 'sequelize', 'typeorm', 'migration', 'database', 'repository'],
  backend_authentication: ['jwt', 'jsonwebtoken', 'passport', 'bcrypt', 'auth', 'middleware', 'guard'],
  backend_middleware: ['middleware', 'next()', 'req', 'res', 'guard', 'interceptor'],
  backend_api: ['express', 'nestjs', 'fastify', 'openapi', 'swagger', 'endpoint'],
  backend_testing: ['supertest', 'request(app)', 'api test', 'controller test'],
  frontend_component: ['React', 'component', 'props', 'jsx', 'tsx', '<template', 'useState'],
  frontend_page: ['page', 'view', 'route component', 'NextPage'],
  frontend_hook: ['useEffect', 'useMemo', 'useCallback', 'hook'],
  frontend_state: ['redux', 'zustand', 'pinia', 'context', 'store'],
  frontend_routing: ['react-router', 'router-link', 'routes', 'BrowserRouter', 'Route'],
  frontend_style: ['tailwind', 'className', 'scss', 'css', 'styled-components'],
  frontend_asset: ['asset', 'public', 'image', 'svg'],
  frontend_config: ['vite', 'next', 'nuxt', 'angular', 'tailwind', 'postcss'],
  frontend_testing: ['vitest', 'cypress', 'playwright', 'testing-library', 'component test'],
  frontend_api_client: ['axios', 'fetch(', 'api client', 'baseURL', 'interceptor'],
  mobile_screen: ['screen', 'React Native', 'SafeAreaView', 'View', 'Text'],
  mobile_navigation: ['react-navigation', 'NavigationContainer', 'Stack', 'Tab'],
  mobile_widget: ['Widget', 'StatelessWidget', 'StatefulWidget', 'Scaffold'],
  mobile_state: ['AppState', 'AsyncStorage', 'provider', 'bloc', 'riverpod'],
  mobile_native_android: ['AndroidManifest', 'Gradle', 'MainActivity', 'kotlin'],
  mobile_native_ios: ['Info.plist', 'Podfile', 'AppDelegate', 'swift'],
  mobile_config: ['expo', 'eas', 'app.json', 'pubspec'],
  mobile_testing: ['detox', 'flutter_test', 'react-native-testing-library'],
  mobile_api_client: ['axios', 'fetch(', 'api client', 'react-native'],
  devops_container: ['FROM', 'WORKDIR', 'COPY', 'docker compose', 'image', 'container'],
  devops_ci_cd: ['workflow', 'actions', 'gitlab-ci', 'jenkins', 'pipeline'],
  devops_infrastructure: ['terraform', 'ansible', 'infrastructure', 'provision'],
  devops_orchestration: ['kubernetes', 'helm', 'deployment', 'service', 'ingress'],
  devops_cloud: ['aws', 'azure', 'gcp', 'cloud'],
  devops_monitoring: ['prometheus', 'grafana', 'metrics', 'logging', 'alert'],
  devops_proxy: ['nginx', 'reverse proxy', 'load balancer'],
  devops_automation: ['script', 'deploy', 'automation', 'release'],
  data_notebook: ['ipynb', 'jupyter', 'notebook'],
  data_preprocessing: ['preprocess', 'clean', 'feature', 'transform'],
  data_analysis: ['pandas', 'numpy', 'analysis', 'dataset', 'dataframe'],
  data_visualization: ['matplotlib', 'seaborn', 'plotly', 'chart', 'visualization'],
  data_ml_training: ['fit(', 'train', 'epoch', 'loss', 'sklearn', 'tensorflow', 'torch'],
  data_model: ['model.pkl', 'joblib', 'predict', 'classifier', 'regressor'],
  data_nlp: ['transformers', 'tokenizer', 'nltk', 'spacy', 'nlp'],
  data_cv: ['opencv', 'cv2', 'image', 'vision'],
  data_pipeline: ['pipeline', 'dag', 'airflow', 'mlflow'],
  data_experiment: ['experiment', 'metrics', 'tracking', 'mlflow'],
  documentation: ['setup', 'install', 'run', 'deploy', 'API', 'Swagger', 'roadmap', 'Dev2Vec', 'Docker'],
  testing: ['jest', 'supertest', 'vitest', 'mocha', 'describe', 'it', 'test', 'expect', 'request(app)', 'npm test', 'integration', 'e2e'],
  ml_service: ['infer', 'train', 'Doc2Vec', 'classifier', 'vector', 'artifact'],
  config: ['config', 'env', 'PORT', 'MONGO', 'JWT', 'DEV2VEC'],
  generic_source: [],
};
const EXCLUDED_SOURCE_PATTERNS = [
  /^node_modules\//i,
  /^\.venv\//i,
  /^venv\//i,
  /^tmp\//i,
  /^temp\//i,
  /^\.git\//i,
  /^ml_service\/artifacts\//i,
  /(^|\/)__pycache__\//i,
  /(^|\/)package-lock\.json$/i,
  /(^|\/)\.env$/i,
  /\.model$/i,
  /\.joblib$/i,
  /\.pyc$/i,
];

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && !(value instanceof Date)
);

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const compactString = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').trim();

const uniqueByLower = (values) => {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const text = compactString(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }

  return output;
};

const clampTopN = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TOP_N;
  return Math.max(1, Math.min(parsed, 3));
};

const normalizeRequestId = (requestId) => {
  const normalized = compactString(requestId);
  return normalized || crypto.randomUUID();
};

const collectTextParts = (value, output, depth = 0) => {
  if (value === undefined || value === null || depth > 4) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = compactString(value);
    if (text) output.push(text);
    return;
  }

  if (value instanceof Date) {
    output.push(value.toISOString());
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTextParts(item, output, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  const preferredKeys = [
    'name',
    'repoName',
    'fullName',
    'description',
    'title',
    'message',
    'body',
    'content',
    'contentPreview',
    'path',
    'filename',
    'fileName',
    'language',
    'defaultBranch',
    'careerDirection',
    'projectType',
    'skill',
    'canonicalSkillName',
    'sourceValue',
    'label',
    'state',
  ];

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      collectTextParts(value[key], output, depth + 1);
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (preferredKeys.includes(key)) continue;
    if (typeof nestedValue === 'string' || typeof nestedValue === 'number') {
      collectTextParts(nestedValue, output, depth + 1);
    } else if (Array.isArray(nestedValue) && depth < 3) {
      collectTextParts(nestedValue, output, depth + 1);
    }
  }
};

const normalizeTextParts = (parts, options = {}) => {
  const maxLength = Number(options.maxLength || DEFAULT_REPO_TEXT_LIMIT);
  const collected = [];
  collectTextParts(parts, collected);

  const text = collected
    .map(compactString)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!Number.isFinite(maxLength) || maxLength <= 0 || text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
};

const sanitizeIssueText = (value = '', maxLength = DEFAULT_ISSUE_BODY_LIMIT) => {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, (block) => block.slice(0, 400))
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
    .replace(/data:[^;\s]+;base64,\S+/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\b(null|undefined)\b/gi, ' ');

  return compactString(text).slice(0, maxLength).trim();
};

const getIssueLabelNames = (issue = {}) => toArray(issue.labels)
  .map((label) => (typeof label === 'string' ? label : label?.name || label?.label || ''))
  .map(compactString)
  .filter(Boolean);

const buildIssueDocument = (issues = [], options = {}) => {
  const maxLength = Number(options.issueMaxLength || DEFAULT_ISSUE_TEXT_LIMIT);
  const bodyMaxLength = Number(options.issueBodyMaxLength || DEFAULT_ISSUE_BODY_LIMIT);
  const seen = new Set();
  const lines = [];

  for (const issue of toArray(issues)) {
    if (!issue || typeof issue !== 'object') continue;
    if (issue.sourceType === 'pull_request' || issue.pull_request) continue;

    const title = sanitizeIssueText(issue.title, 300);
    const labels = uniqueByLower(getIssueLabelNames(issue)).slice(0, 12);
    const body = sanitizeIssueText(issue.body, bodyMaxLength);
    const comments = uniqueByLower(getIssueComments(issue).map((comment) => sanitizeIssueText(comment, 300))).slice(0, 3);
    if (!title && !labels.length && !body && !comments.length) continue;

    const key = issue.number
      ? `${issue.repositoryFullName || issue.fullName || ''}#${issue.number}`
      : `${title}:${labels.join(',')}:${body.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push([
      title ? `issue title: ${title}` : '',
      labels.length ? `labels: ${labels.join(' ')}` : '',
      issue.state ? `state: ${sanitizeIssueText(issue.state, 40)}` : '',
      body ? `body: ${body}` : '',
      comments.length ? `comments: ${comments.join(' ')}` : '',
    ].filter(Boolean).join('\n'));

    if (lines.join('\n\n').length >= maxLength) break;
  }

  return lines.join('\n\n').slice(0, maxLength).trim().toLowerCase();
};

const normalizeToken = (value, maxLength = DEFAULT_TOKEN_LIMIT) => {
  const token = compactString(value)
    .toLowerCase()
    .replace(/^["'`]+|["'`,;]+$/g, '');

  if (!token || token.length > maxLength) return '';
  return /^[a-z0-9@._+/#:-]+$/.test(token) ? token : '';
};

const collectTokenCandidates = (value, output, depth = 0) => {
  if (value === undefined || value === null || depth > 5) return;

  if (typeof value === 'string' || typeof value === 'number') {
    const token = normalizeToken(value);
    if (token) output.push(token);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectTokenCandidates(item, output, depth + 1);
    return;
  }

  if (!isPlainObject(value)) return;

  const tokenKeys = [
    'packages',
    'frameworks',
    'detectedFrameworks',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'configs',
    'packageFiles',
    'languages',
  ];

  for (const key of tokenKeys) {
    const nestedValue = value[key];
    if (!nestedValue) continue;

    if (isPlainObject(nestedValue)) {
      for (const dependencyName of Object.keys(nestedValue)) {
        collectTokenCandidates(dependencyName, output, depth + 1);
      }
    } else {
      collectTokenCandidates(nestedValue, output, depth + 1);
    }
  }

  for (const file of toArray(value.detectedFiles)) {
    collectTokenCandidates(file?.name || file?.path || file?.fileName, output, depth + 1);
  }

  const rawData = value.rawData;
  if (rawData && depth < 2) {
    collectTokenCandidates(rawData.packageJson, output, depth + 1);
    collectTokenCandidates(rawData.dependencies, output, depth + 1);
    collectTokenCandidates(rawData.devDependencies, output, depth + 1);
    collectTokenCandidates(rawData.frameworks, output, depth + 1);
    collectTokenCandidates(rawData.configs, output, depth + 1);
  }
};

const normalizeApiTokens = (tokens, options = {}) => {
  const maxTokenLength = Number(options.maxTokenLength || DEFAULT_TOKEN_LIMIT);
  const candidates = [];
  collectTokenCandidates(tokens, candidates);

  const seen = new Set();
  const output = [];

  for (const candidate of candidates) {
    const token = normalizeToken(candidate, maxTokenLength);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }

  return output;
};

const normalizeChannelStatus = (value, fallback) => {
  const text = compactString(value).toLowerCase();
  return text || fallback;
};

const buildChannelAvailability = ({ repoDocument, issueDocument, apiTokens, sourceUsage, availableFiles, overrides = {} }) => {
  const repoStatus = normalizeChannelStatus(
    overrides.repo,
    repoDocument && repoDocument.trim() ? 'available' : 'insufficient_metadata',
  );
  const issueStatus = normalizeChannelStatus(
    overrides.issue,
    issueDocument && issueDocument.trim() ? 'available' : 'not_fetched',
  );
  const apiStatus = normalizeChannelStatus(
    overrides.api,
    apiTokens.length
      ? 'available'
      : (availableFiles.length ? (sourceUsage?.files?.some((file) => file.error) ? 'parse_failed' : 'no_usage_tokens') : 'no_source_content'),
  );

  return {
    availableChannels: {
      repo: repoStatus === 'available',
      issue: issueStatus === 'available',
      api: apiStatus === 'available',
    },
    channelStatus: {
      repo: repoStatus,
      issue: issueStatus,
      api: apiStatus,
    },
  };
};

const getRepositoryReadmeParts = (repository = {}) => [
  repository.readme,
  repository.readmeContent,
  repository.contentPreview,
  repository.readme?.contentPreview,
  repository.rawData?.readme,
  repository.rawData?.readmeContent,
  repository.rawData?.contentPreview,
];

const objectKeys = (value) => (isPlainObject(value) ? Object.keys(value) : []);

const getChangedFilePath = (file) => {
  if (typeof file === 'string') return file;
  return file?.filename || file?.path || file?.fileName || file?.name || '';
};

const isExcludedSourcePath = (path) => EXCLUDED_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizePath(path)));

const getFileContent = (file = {}) => {
  const content = file.sourceContent || file.content || file.contentPreview || file.parsedData?.content || '';
  return String(content || '').replace(/\0/g, '');
};

const getMatchedKeywords = (content, category, secondaryCategories = []) => {
  const text = String(content || '');
  const lower = text.toLowerCase();
  const keywords = [category, ...secondaryCategories].flatMap((item) => KEYWORDS_BY_CATEGORY[item] || []);
  return uniqueByLower(keywords.filter((keyword) => (
    lower.includes(String(keyword).toLowerCase())
  )));
};

const categoryRole = (category) => (
  Object.entries(ROLE_CATEGORY_GROUPS).find(([, categories]) => categories.includes(category))?.[0] || ''
);

const extensionOf = (path) => {
  const normalized = normalizePath(path).toLowerCase();
  const match = normalized.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1] : '';
};

const buildProjectSignals = (files = []) => {
  const combined = files.map((file) => `${normalizePath(file.path || file.fileName || file.name)}\n${getFileContent(file)}`).join('\n').toLowerCase();
  const paths = files.map((file) => normalizePath(file.path || file.fileName || file.name).toLowerCase()).join('\n');
  const has = (patterns) => patterns.some((pattern) => pattern.test(combined));
  return {
    backend: has([/express|fastify|koa|@nestjs|nestjs|mongoose|sequelize|typeorm|prisma|jsonwebtoken|passport|bcrypt/, /router\.(get|post|put|patch|delete)/, /@controller/]),
    frontend: has([/react-dom|react-router|@vitejs|vite|next\.config|"next"\s*:|vue|@angular|svelte|tailwindcss|zustand|redux|pinia/, /src\/(components|pages|views|hooks|layouts|styles)\//, /\.(jsx|tsx|vue|svelte|scss|sass|less)\b/]),
    mobile: /react-native|@react-navigation|flutter|native-base|react-native-paper/.test(combined)
      || /\bexpo\b/.test(combined)
      || /(^|\/)(android|ios|screens|navigation|mobile|widgets)\//m.test(paths)
      || /(^|\/)(app\.json|app\.config\.(js|ts)|eas\.json|pubspec\.yaml|podfile|androidmanifest\.xml)$/m.test(paths),
    devops: has([/dockerfile|docker-compose|compose\.ya?ml|\.github\/workflows|\.gitlab-ci|jenkinsfile|terraform|kubernetes|helm|ansible|prometheus|grafana|nginx/]),
    data: has([/pandas|numpy|scikit-learn|sklearn|tensorflow|keras|torch|pytorch|transformers|xgboost|lightgbm|matplotlib|plotly|jupyter|mlflow|opencv|spacy|nltk/, /(^|\/)(notebooks|data|datasets|experiments|training|preprocessing|features|pipelines)\//, /\.ipynb\b/]),
  };
};

const addUnique = (items, value) => {
  if (value && !items.includes(value)) items.push(value);
};

const makeClassification = (category, secondaryCategories = [], matchedSignals = [], specificityLevel = 'generic') => ({
  category,
  secondaryCategories: uniqueByLower(secondaryCategories.filter((item) => item && item !== category)),
  roleHints: uniqueByLower([categoryRole(category), ...secondaryCategories.map(categoryRole)].filter(Boolean)),
  matchedSignals: uniqueByLower(matchedSignals),
  specificityLevel,
});

const hasBackendServerSignal = (lower, content) => (
  /express|fastify|koa|hapi|@nestjs|nestjs|spring-boot|django|flask|laravel|rails|asp\.net/.test(content)
  || /router\.(get|post|put|patch|delete)|express\.router|@controller|@injectable|req\.|res\.|request\(|response\(/.test(content)
  || /(^|\/)(server|api|migrations|prisma|database)\//.test(lower)
);

const hasDatabaseSignal = (lower, content) => (
  /mongoose|sequelize|typeorm|prisma|schema\.prisma|mongodb|postgres|mysql|migration|repository/.test(content)
  || /(^|\/)(migrations|prisma|database)\//.test(lower)
);

const hasFrontendSignal = (lower, ext, content, projectSignals) => (
  /\.(jsx|tsx|vue|svelte|css|scss|sass|less)$/.test(ext)
  || /react-dom|react-router|vue|angular|vite|next\.config|"next"\s*:|nuxt|svelte|tailwind|redux|zustand|pinia|jsx|tsx|classname|useeffect|usestate/.test(content)
  || /(^|\/)(components|pages|views|hooks|context|store|layouts|assets|styles|public)\//.test(lower)
  || (projectSignals.frontend && !projectSignals.mobile && /(^|\/)src\/(features|services|api|lib)\//.test(lower) && /axios|fetch\(|api client|baseurl|interceptor|createcontext|provider/.test(content))
);

const hasMobileSignal = (lower, ext, content, projectSignals) => (
  projectSignals.mobile
  || /\.(dart|swift|kt|kts)$/.test(ext)
  || /react-native|expo|flutter|@react-navigation|navigationcontainer|androidmanifest|podfile|info\.plist|safeareaview|statelesswidget|statefulwidget/.test(content)
  || /(^|\/)(screens|navigation|mobile|android|ios|widgets)\//.test(lower)
);

const inferSourceClassification = (file = {}, projectSignals = {}) => {
  const path = normalizePath(file.path || file.fileName || file.name);
  const lower = path.toLowerCase();
  const ext = extensionOf(path);
  const content = getFileContent(file).toLowerCase();
  const secondary = [];
  const signals = [];

  if (lower === 'readme.md' || lower.endsWith('.md') || lower.startsWith('docs/')) return makeClassification('documentation', [], ['markdown-doc'], 'generic');
  if (lower.startsWith('ml_service/')) return makeClassification('ml_service', ['data_pipeline', 'data_ml_training'], ['ml_service-path'], 'strong');
  if (/(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path)) {
    if (/supertest|request\(app\)|controller|route|endpoint/.test(content)) return makeClassification('backend_testing', ['testing'], ['backend-test'], 'strong');
    if (/testing-library|component|render\(|cypress|playwright/.test(content) || projectSignals.frontend) return makeClassification('frontend_testing', ['testing'], ['frontend-test'], 'strong');
    if (/detox|react-native|flutter_test/.test(content) || projectSignals.mobile) return makeClassification('mobile_testing', ['testing'], ['mobile-test'], 'strong');
    return makeClassification('testing', [], ['generic-test'], 'generic');
  }

  if (lower === 'dockerfile' || lower.includes('docker-compose') || lower.includes('compose.yaml') || lower.includes('compose.yml') || lower === '.dockerignore') {
    return makeClassification('devops_container', [], ['container-file'], lower === 'dockerfile' ? 'strong' : 'exact');
  }
  if (lower.startsWith('.github/workflows/') || lower.endsWith('.gitlab-ci.yml') || lower.endsWith('jenkinsfile')) return makeClassification('devops_ci_cd', [], ['ci-cd-file'], 'exact');
  if (/terraform|ansible|infrastructure/.test(lower)) return makeClassification('devops_infrastructure', [], ['infrastructure-path'], 'exact');
  if (/k8s|kubernetes|helm|charts/.test(lower)) return makeClassification('devops_orchestration', [], ['orchestration-path'], 'exact');
  if (/monitoring|prometheus|grafana/.test(lower)) return makeClassification('devops_monitoring', [], ['monitoring-path'], 'exact');
  if (/nginx/.test(lower)) return makeClassification('devops_proxy', [], ['proxy-config'], 'exact');

  // Unambiguous client files must be classified before broad data/mobile path
  // heuristics (for example components/data and src/features/auth).
  if (hasFrontendSignal(lower, ext, content, projectSignals)
    && !hasMobileSignal(lower, ext, content, {})
    && !hasBackendServerSignal(lower, content)) {
    if (/vite\.config|next\.config|nuxt\.config|angular\.json|tailwind\.config|postcss\.config/.test(lower)) return makeClassification('frontend_config', [], ['frontend-config'], 'exact');
    if (/axios|fetch\(|api client|baseurl|interceptor/.test(content)) addUnique(secondary, 'frontend_api_client');
    if (/routes?\//.test(lower) || /react-router|browserrouter|router-link|<route/.test(content)) addUnique(secondary, 'frontend_routing');
    if (/pages?\/|views?\//.test(lower)) addUnique(secondary, 'frontend_page');
    if (/components?\//.test(lower) || /\.(jsx|tsx|vue|svelte)$/.test(ext)) addUnique(secondary, 'frontend_component');
    if (/hooks?\//.test(lower) || /useeffect|usememo|usecallback|function use[A-Z]/.test(content)) addUnique(secondary, 'frontend_hook');
    if (/context|store|redux|zustand|pinia/.test(lower) || /redux|zustand|pinia|createcontext|provider/.test(content)) addUnique(secondary, 'frontend_state');
    if (/styles?\/|\.css$|\.scss$|\.sass$|\.less$/.test(lower) || /tailwind|classname|styled-components/.test(content)) addUnique(secondary, 'frontend_style');
    const primary = secondary[0] || 'frontend_component';
    return makeClassification(primary, secondary.slice(1), [primary.replace('frontend_', 'frontend-')], 'strong');
  }

  if (lower.endsWith('.ipynb') || /(^|\/)notebooks\//.test(lower)) return makeClassification('data_notebook', [], ['notebook'], 'exact');
  if (projectSignals.data && /(^|\/)(preprocessing|features)(\/|$)/.test(lower)) return makeClassification('data_preprocessing', [], ['data-preprocessing-path'], 'strong');
  if (/experiments/.test(lower)) return makeClassification('data_experiment', [], ['experiment-path'], 'strong');
    if (/models?\//.test(lower) && /tensorflow|torch|sklearn|predict|classifier|regressor|joblib|pickle/.test(content)) return makeClassification('data_model', [], ['ml-model-signal'], 'strong');
    if (/training/.test(lower) || /fit\(|epochs?|loss|train_test_split|tensorflow|torch|sklearn|scikit/.test(content)) return makeClassification('data_ml_training', [], ['ml-training-signal'], 'strong');
  if (/pandas|numpy|dataframe|dataset|csv|parquet/.test(content) || /(^|\/)(data|datasets)\//.test(lower)) return makeClassification('data_analysis', [], ['data-analysis-signal'], 'strong');
  if (/matplotlib|seaborn|plotly|chart|visualization/.test(content)) return makeClassification('data_visualization', [], ['data-visualization-signal'], 'strong');
  if (/transformers|tokenizer|nltk|spacy|nlp/.test(content)) return makeClassification('data_nlp', [], ['nlp-signal'], 'strong');
  if (/opencv|cv2|vision|image/.test(content)) return makeClassification('data_cv', [], ['cv-signal'], 'strong');

  if (/android/.test(lower) || /androidmanifest|gradle|mainactivity|kotlin/.test(content)) return makeClassification('mobile_native_android', [], ['android-signal'], 'exact');
  if (/(^|\/)ios\//.test(lower) || /podfile|info\.plist|appdelegate|swift/.test(content)) return makeClassification('mobile_native_ios', [], ['ios-signal'], 'exact');
  if (/^(app\.json|app\.config\.(js|ts)|eas\.json|pubspec\.yaml)$/i.test(lower)) return makeClassification('mobile_config', [], ['mobile-config'], 'exact');
  if (/screens?\//.test(lower) && hasMobileSignal(lower, ext, content, projectSignals)) return makeClassification('mobile_screen', [], ['mobile-screen-path'], 'strong');
  if ((/navigation/.test(lower) || /react-navigation|navigationcontainer/.test(content)) && hasMobileSignal(lower, ext, content, projectSignals)) return makeClassification('mobile_navigation', [], ['mobile-navigation'], 'strong');
  if (projectSignals.mobile && /axios|fetch\(|api client|baseurl/.test(content) && !hasBackendServerSignal(lower, content)) return makeClassification('mobile_api_client', [], ['mobile-api-client'], 'strong');

  const backendContextSignal = hasBackendServerSignal(lower, content) || (
    projectSignals.backend
    && /(^|\/)src\/(routes|controllers|services|models|entities|repositories|middleware|middlewares|guards|modules|api)\//.test(lower)
  );

  if (backendContextSignal) {
    if (/routes?\//.test(lower) || /router\.(get|post|put|patch|delete)|express\.router/.test(content)) return makeClassification('backend_route', [], ['backend-route'], 'strong');
    if (/middlewares?|guards?/.test(lower) || /middleware|next\(|canactivate|guard/.test(content)) return makeClassification('backend_middleware', ['backend_authentication'], ['backend-middleware'], 'strong');
    if (/auth/.test(lower) || /jsonwebtoken|passport|bcrypt|jwt/.test(content)) return makeClassification('backend_authentication', [], ['backend-authentication'], 'strong');
    if (/controllers?\//.test(lower) || /@controller|req\.|res\.|request|response/.test(content)) return makeClassification('backend_controller', [], ['backend-controller'], 'strong');
    if (hasDatabaseSignal(lower, content)) return makeClassification('backend_database', ['backend_model'], ['backend-database'], 'strong');
    if (/models?|entities/.test(lower)) return makeClassification('backend_model', [], ['backend-model'], 'strong');
    if (/services?|repositories/.test(lower) || /@injectable/.test(content)) return makeClassification('backend_service', [], ['backend-service'], 'strong');
    return makeClassification('backend_api', [], ['backend-api'], 'strong');
  }

  if (hasFrontendSignal(lower, ext, content, projectSignals)) {
    if (/vite\.config|next\.config|nuxt\.config|angular\.json|tailwind\.config|postcss\.config/.test(lower)) return makeClassification('frontend_config', [], ['frontend-config'], 'exact');
    if (/components?\//.test(lower) || /\.(jsx|tsx|vue|svelte)$/.test(ext) || /component|props|jsx|tsx|<template|usestate/.test(content)) addUnique(secondary, 'frontend_component');
    if (/pages?\/|views?\//.test(lower)) addUnique(secondary, 'frontend_page');
    if (/hooks?\//.test(lower) || /useeffect|usememo|usecallback|function use[A-Z]/.test(content)) addUnique(secondary, 'frontend_hook');
    if (/context|store|redux|zustand|pinia/.test(lower) || /redux|zustand|pinia|createcontext|provider/.test(content)) addUnique(secondary, 'frontend_state');
    if (/routes?\//.test(lower) || /react-router|browserrouter|router-link|<route/.test(content)) addUnique(secondary, 'frontend_routing');
    if (/styles?\/|\.css$|\.scss$|\.sass$|\.less$/.test(lower) || /tailwind|classname|styled-components/.test(content)) addUnique(secondary, 'frontend_style');
    if (/assets?\/|public\//.test(lower)) addUnique(secondary, 'frontend_asset');
    if (/axios|fetch\(|api client|baseurl|interceptor/.test(content) && !hasBackendServerSignal(lower, content)) addUnique(secondary, 'frontend_api_client');
    const primary = secondary[0] || 'frontend_component';
    signals.push(primary.replace('frontend_', 'frontend-'));
    return makeClassification(primary, secondary.slice(1), signals, primary === 'frontend_api_client' ? 'strong' : 'strong');
  }

  if (hasMobileSignal(lower, ext, content, projectSignals)) {
    if (/axios|fetch\(|api client|baseurl/.test(content) && !hasBackendServerSignal(lower, content)) return makeClassification('mobile_api_client', [], ['mobile-api-client'], 'strong');
    if (/widget|statelesswidget|statefulwidget|scaffold/.test(content) || /\.(dart)$/.test(ext)) return makeClassification('mobile_widget', [], ['mobile-widget'], 'strong');
    if (/appstate|asyncstorage|provider|bloc|riverpod/.test(content)) return makeClassification('mobile_state', [], ['mobile-state'], 'strong');
  }

  if (lower.endsWith('.env.example') || lower.endsWith('.env.production.example') || lower.startsWith('src/config/') || lower.startsWith('src/utils/')) return makeClassification('config', [], ['config-file'], 'generic');
  return lower.startsWith('src/') || lower === 'server.js' ? makeClassification('generic_source', [], ['generic-source'], 'generic') : makeClassification('config', [], ['config-file'], 'generic');
};

const getCategoryReason = (path, category) => {
  const role = categoryRole(category);
  if (role) return `${role} role-specific source evidence from ${path}`;
  if (category === 'testing') return 'Test file or test script evidence';
  if (category === 'documentation') return 'README/docs markdown evidence';
  if (category === 'ml_service') return 'Dev2Vec ML service evidence';
  if (category === 'config') return 'Configuration evidence';
  return `Source evidence from ${path}`;
};

const hasSourceCategory = (file, category) => (
  file.category === category || toArray(file.secondaryCategories).includes(category)
);

const getPrimaryCategoryCount = (files, category) => (
  files.filter((file) => file.category === category).length
);

const getEffectiveCategoryCount = (files, category) => (
  files.filter((file) => hasSourceCategory(file, category)).length
);

const selectRepoEvidenceFilesByQuota = (candidates, limits) => {
  const selected = [];
  const selectedKeys = new Set();
  let totalChars = 0;

  const sortedCandidates = [...candidates].sort((left, right) => (
    CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category)
    || left.path.localeCompare(right.path)
  ));

  const canSelect = (file, quotaCategory = file.category) => {
    if (selectedKeys.has(file.path.toLowerCase())) return false;
    if (selected.length >= limits.maxFilesTotal) return false;
    if (totalChars >= limits.maxTotalSourceChars) return false;

    const quota = CATEGORY_QUOTAS[quotaCategory] || {};
    if (Number.isFinite(quota.max) && getPrimaryCategoryCount(selected, quotaCategory) >= quota.max) {
      return false;
    }

    return true;
  };

  const addFile = (file) => {
    const remaining = limits.maxTotalSourceChars - totalChars;
    if (remaining <= 0) return false;
    const snippet = file.snippet.slice(0, Math.min(limits.maxCharsPerFile, remaining));
    if (!snippet) return false;

    selectedKeys.add(file.path.toLowerCase());
    totalChars += snippet.length;
    selected.push({
      path: file.path,
      category: file.category,
      secondaryCategories: file.secondaryCategories,
      roleHints: file.roleHints,
      reason: file.reason,
      matchedKeywords: file.matchedKeywords,
      matchedSignals: file.matchedSignals,
      specificityLevel: file.specificityLevel,
      snippetCharCount: snippet.length,
      snippet,
    });
    return true;
  };

  const selectForCategory = (category, targetCount) => {
    const bucket = sortedCandidates.filter((file) => hasSourceCategory(file, category));
    for (const file of bucket) {
      if (getEffectiveCategoryCount(selected, category) >= targetCount) break;
      if (!canSelect(file, file.category)) continue;
      addFile(file);
    }
  };

  for (const roleCategories of Object.values(ROLE_CATEGORY_GROUPS)) {
    const roleCandidates = sortedCandidates.filter((file) => roleCategories.some((category) => hasSourceCategory(file, category)));
    if (!roleCandidates.length) continue;
    for (const category of roleCategories) {
      const bucketCount = sortedCandidates.filter((file) => hasSourceCategory(file, category)).length;
      if (bucketCount === 0) continue;
      selectForCategory(category, Math.min(bucketCount, 2));
    }
  }

  for (const category of CATEGORY_PRIORITY.filter((item) => item !== 'generic_source')) {
    const quota = CATEGORY_QUOTAS[category] || {};
    const targetCount = Number.isFinite(quota.max) ? quota.max : limits.maxFilesTotal;
    selectForCategory(category, targetCount);
  }

  if (selected.length < limits.maxFilesTotal && totalChars < limits.maxTotalSourceChars) {
    for (const file of sortedCandidates.filter((candidate) => candidate.category === 'generic_source')) {
      if (!canSelect(file, 'generic_source')) continue;
      addFile(file);
    }
  }

  selected.sort((left, right) => (
    CATEGORY_PRIORITY.indexOf(left.category) - CATEGORY_PRIORITY.indexOf(right.category)
    || left.path.localeCompare(right.path)
  ));

  return {
    selected,
    sourceEvidenceCharCount: totalChars,
  };
};

const collectRepoEvidenceFiles = (fileTreeOrAvailableFiles = [], options = {}) => {
  const limits = { ...SOURCE_LIMITS, ...(options.sourceLimits || {}) };
  const seen = new Set();
  const candidates = [];
  let excludedFileCount = 0;
  const rawFiles = toArray(fileTreeOrAvailableFiles);
  const projectSignals = buildProjectSignals(rawFiles);

  for (const rawFile of rawFiles) {
    const path = normalizePath(rawFile?.path || rawFile?.fileName || rawFile?.name);
    if (!path || seen.has(path.toLowerCase()) || isExcludedSourcePath(path)) {
      if (path) excludedFileCount += 1;
      continue;
    }

    const content = getFileContent(rawFile);
    if (!content) continue;

    const classification = inferSourceClassification({ ...rawFile, path }, projectSignals);
    const category = classification.category;
    const secondaryCategories = classification.secondaryCategories;

    seen.add(path.toLowerCase());

    candidates.push({
      path,
      category,
      secondaryCategories,
      roleHints: classification.roleHints,
      reason: getCategoryReason(path, category),
      matchedKeywords: getMatchedKeywords(content, category, secondaryCategories),
      matchedSignals: classification.matchedSignals,
      specificityLevel: classification.specificityLevel,
      status: rawFile.status || '',
      additions: Number(rawFile.additions || 0),
      deletions: Number(rawFile.deletions || 0),
      changes: Number(rawFile.changes || 0),
      commitSha: rawFile.commitSha || '',
      snippet: content.slice(0, limits.maxCharsPerFile),
    });
  }

  const selection = selectRepoEvidenceFilesByQuota(candidates, limits);

  return {
    sourceFiles: selection.selected,
    excludedFileCount: excludedFileCount + Math.max(0, candidates.length - selection.selected.length),
    sourceEvidenceCharCount: selection.sourceEvidenceCharCount,
  };
};

const formatSourceSection = (title, files) => {
  const parts = [`## ${title}`];
  if (!files.length) {
    parts.push('No source evidence found.');
    return parts.join('\n');
  }

  for (const file of files) {
    parts.push(
      `FILE: ${file.path}`,
      `CATEGORY: ${file.category}`,
      `SECONDARY_CATEGORIES: ${(file.secondaryCategories || []).join(', ') || 'none'}`,
      `ROLE_HINTS: ${(file.roleHints || []).join(', ') || 'none'}`,
      `SPECIFICITY: ${file.specificityLevel || 'generic'}`,
      `SIGNALS: ${(file.matchedSignals || []).join(', ') || 'none'}`,
      `KEYWORDS: ${file.matchedKeywords.join(', ') || 'none'}`,
      'SNIPPET:',
      file.snippet,
      '',
    );
  }
  return parts.join('\n');
};

const buildUserContributionFiles = ({ commits = [], availableFiles = [], options = {} } = {}) => {
  const sourceByPath = new Map();
  for (const file of toArray(availableFiles)) {
    const path = normalizePath(file.path || file.fileName || file.name);
    if (path) sourceByPath.set(path.toLowerCase(), file);
  }

  const rawFiles = [];
  const seen = new Set();
  for (const commit of toArray(commits)) {
    const normalizedEvidence = toArray(commit?.normalizedFiles);
    const contributionFiles = normalizedEvidence.length ? normalizedEvidence : toArray(commit?.files);
    for (const file of contributionFiles) {
      const path = normalizePath(getChangedFilePath(file));
      if (!path || isExcludedSourcePath(path)) continue;
      const key = path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const sourceFile = normalizedEvidence.length ? null : sourceByPath.get(key);
      const normalizedSignals = normalizedEvidence.length ? [
        ...toArray(file.detectedLanguages),
        ...toArray(file.detectedFrameworks),
        ...toArray(file.detectedLibraries),
        ...toArray(file.detectedPatterns),
        ...toArray(file.detectedRoleSignals).map((role) => `role:${role}`),
        ...toArray(file.skillSignals),
      ] : [];
      const syntheticContent = [
        path,
        file.status,
        `additions ${Number(file.additions || 0)}`,
        `deletions ${Number(file.deletions || 0)}`,
        ...normalizedSignals,
        sourceFile ? getFileContent(sourceFile) : '',
      ].filter(Boolean).join('\n');
      rawFiles.push({
        ...sourceFile,
        path,
        sourceContent: syntheticContent,
        status: file.status || '',
        additions: Number(file.additions || 0),
        deletions: Number(file.deletions || 0),
        changes: Number(file.changes || 0),
        commitSha: commit.sha || '',
        evidenceSource: file.evidenceSource || (sourceFile ? 'repository_source_match' : 'path_only'),
      });
    }
  }

  return collectRepoEvidenceFiles(rawFiles, {
    ...options,
    sourceLimits: {
      ...SOURCE_LIMITS,
      maxFilesTotal: Math.min(Number(options.userContributionMaxFiles || 40), SOURCE_LIMITS.maxFilesTotal),
      maxCharsPerFile: Math.min(Number(options.userContributionMaxCharsPerFile || 1000), SOURCE_LIMITS.maxCharsPerFile),
      maxTotalSourceChars: Math.min(Number(options.userContributionMaxTotalChars || 12000), SOURCE_LIMITS.maxTotalSourceChars),
      ...(options.userContributionSourceLimits || {}),
    },
  });
};

const formatUserContributionSection = (files = []) => {
  const parts = ['## User contribution evidence'];
  if (!files.length) {
    parts.push('No changed-file detail evidence found for matched user commits.');
    return parts.join('\n');
  }

  for (const file of files) {
    parts.push(
      `FILE: ${file.path}`,
      `CATEGORY: ${file.category}`,
      `ROLE_HINTS: ${(file.roleHints || []).join(', ') || 'none'}`,
      `STATUS: ${file.status || 'unknown'}`,
      `LINES: +${Number(file.additions || 0)} -${Number(file.deletions || 0)}`,
      `SIGNALS: ${(file.matchedSignals || []).join(', ') || 'none'}`,
      '',
    );
  }
  return parts.join('\n');
};

const buildRepoDocumentWithSourceEvidence = ({ metadataText, apiTokens, commits, sourceFiles, userContributionFiles }) => {
  const commitLines = toArray(commits).slice(0, PREVIEW_LIMITS.commits).map((commit) => (
    `- ${commit.sha ? String(commit.sha).slice(0, 12) : 'commit'} ${compactString(commit.message)} ${getCommitChangedFiles(commit).join(', ')}`
  ));
  const hasCategory = (file, category) => file.category === category || toArray(file.secondaryCategories).includes(category);
  const filesByCategory = (category) => sourceFiles.filter((file) => hasCategory(file, category));
  const filesByRole = (role) => sourceFiles.filter((file) => toArray(file.roleHints).includes(role));
  const docFiles = filesByCategory('documentation');
  const mlFiles = filesByCategory('ml_service');

  return [
    '## Repository metadata',
    metadataText || 'No repository metadata.',
    '## API/dependency tokens',
    apiTokens.join(' ') || 'No API/dependency tokens.',
    '## Commit summaries',
    commitLines.join('\n') || 'No commit summaries.',
    formatSourceSection('Source evidence: Backend', filesByRole('backend')),
    formatSourceSection('Source evidence: Frontend', filesByRole('frontend')),
    formatSourceSection('Source evidence: Mobile', filesByRole('mobile')),
    formatSourceSection('Source evidence: DevOps', filesByRole('devops')),
    formatSourceSection('Source evidence: Data Science', filesByRole('data')),
    formatSourceSection('Source evidence: Testing', filesByCategory('testing')),
    formatSourceSection('Documentation evidence', docFiles),
    formatSourceSection('ML service evidence', mlFiles),
    formatUserContributionSection(userContributionFiles),
    formatSourceSection('Additional source/config evidence', sourceFiles.filter((file) => (
      !toArray(file.roleHints).length
      && !['testing', 'documentation', 'ml_service'].some((category) => hasCategory(file, category))
    ))),
  ].join('\n\n').slice(0, DEFAULT_REPO_TEXT_LIMIT);
};

const hasAnyKeyword = (files, keywords) => {
  const normalized = keywords.map((keyword) => String(keyword).toLowerCase());
  return files.some((file) => {
    const path = file.path.toLowerCase();
    const content = `${file.matchedKeywords.join(' ')} ${file.snippet}`.toLowerCase();
    return normalized.some((keyword) => path.includes(keyword) || content.includes(keyword));
  });
};

const buildFeature = (detected, evidenceFiles) => ({
  detected,
  evidence: evidenceFiles.slice(0, 10).map((file) => ({
    path: file.path,
    category: file.category,
    secondaryCategories: file.secondaryCategories || [],
    roleHints: file.roleHints || [],
    matchedKeywords: file.matchedKeywords,
    matchedSignals: file.matchedSignals || [],
    specificityLevel: file.specificityLevel || 'generic',
    snippetCharCount: file.snippetCharCount,
  })),
});

const detectRepoFeatureEvidence = ({ apiTokens = [], sourceFiles = [], docsEvidence = {} } = {}) => {
  const tokenText = apiTokens.join(' ').toLowerCase();
  const hasCategory = (file, category) => file.category === category || toArray(file.secondaryCategories).includes(category);
  const byCategory = (category) => sourceFiles.filter((file) => hasCategory(file, category));
  const byRole = (role) => sourceFiles.filter((file) => toArray(file.roleHints).includes(role));
  const backendFiles = byRole('backend');
  const frontendFiles = byRole('frontend');
  const mobileFiles = byRole('mobile');
  const devopsFiles = byRole('devops');
  const dataFiles = byRole('data');
  const restFiles = sourceFiles.filter((file) => ['backend_route', 'backend_controller', 'backend_api', 'generic_source', 'config'].some((category) => hasCategory(file, category)));
  const databaseFiles = sourceFiles.filter((file) => ['backend_database', 'backend_model', 'generic_source'].some((category) => hasCategory(file, category)));
  const authFiles = sourceFiles.filter((file) => ['backend_authentication', 'backend_middleware', 'generic_source'].some((category) => hasCategory(file, category)));
  const dockerFiles = byCategory('devops_container');
  const testingFiles = byCategory('testing');
  const docFiles = byCategory('documentation');

  return {
    'REST API': buildFeature(
      /(^|\s)(express|@nestjs\/|nestjs|fastify|koa|hapi|swagger|openapi|supertest)(\s|$)/.test(tokenText)
        || hasAnyKeyword(restFiles, ['express.router', 'router.get', 'router.post', 'router.put', 'router.delete', 'controller', 'swagger', 'openapi', 'endpoint']),
      restFiles,
    ),
    Database: buildFeature(
      /mongoose|mongodb/.test(tokenText) || hasAnyKeyword(databaseFiles, ['mongoose', 'schema', 'findone', 'findbyid', 'create', 'populate', 'aggregate']),
      databaseFiles,
    ),
    Authentication: buildFeature(
      /jsonwebtoken|bcrypt|bcryptjs|jwt/.test(tokenText) || hasAnyKeyword(authFiles, ['jwt', 'bcrypt', 'login', 'register', 'bearer', 'adminmiddleware', 'revoked']),
      authFiles,
    ),
    'Docker Basics': buildFeature(
      /docker|dockerfile|docker-compose/.test(tokenText) || dockerFiles.length > 0,
      dockerFiles,
    ),
    'API Testing': buildFeature(
      /jest|supertest|vitest|mocha|chai/.test(tokenText) || hasAnyKeyword(testingFiles, ['jest', 'supertest', 'request(app)', 'describe(', 'expect(', 'npm test']),
      testingFiles,
    ),
    Documentation: buildFeature(
      Boolean(docsEvidence.readmeRootExists || docsEvidence.markdownFileCount > 0 || docsEvidence.hasDocsDirectory || docFiles.length > 0),
      docFiles,
    ),
    Frontend: buildFeature(
      /react|react-dom|vue|angular|vite|next|nuxt|svelte|tailwindcss|redux|zustand|pinia|react-router/.test(tokenText) || frontendFiles.length > 0,
      frontendFiles,
    ),
    Mobile: buildFeature(
      /react-native|expo|flutter|@react-navigation|native-base/.test(tokenText) || mobileFiles.length > 0,
      mobileFiles,
    ),
    DevOps: buildFeature(
      /docker|kubernetes|terraform|helm|ansible|github actions|gitlab ci|jenkins|prometheus|grafana/.test(tokenText) || devopsFiles.length > 0,
      devopsFiles,
    ),
    'Data Science': buildFeature(
      /pandas|numpy|scikit-learn|sklearn|tensorflow|torch|pytorch|transformers|jupyter|mlflow/.test(tokenText) || dataFiles.length > 0,
      dataFiles,
    ),
    Backend: buildFeature(
      /express|nestjs|fastify|mongoose|sequelize|typeorm|prisma|jsonwebtoken|passport|bcrypt/.test(tokenText) || backendFiles.length > 0,
      backendFiles,
    ),
  };
};

const getCommitChangedFiles = (commit) => {
  const fromFiles = toArray(commit?.files).map(getChangedFilePath).filter(Boolean);
  const fromChangedFiles = toArray(commit?.changedFiles)
    .map(getChangedFilePath)
    .filter(Boolean);

  return uniqueByLower([...fromFiles, ...fromChangedFiles]);
};

const getIssueLabels = (issue) => toArray(issue?.labels)
  .map((label) => {
    if (typeof label === 'string') return label;
    return label?.name || label?.label || '';
  })
  .filter(Boolean);

const getIssueComments = (issue) => toArray(issue?.comments)
  .map((comment) => (typeof comment === 'string' ? comment : comment?.body || comment?.message || comment?.content || ''))
  .filter(Boolean);

const extractAnalysisParts = (analysisSource) => {
  const sources = [
    analysisSource,
    analysisSource?.analysis,
    analysisSource?.latestAnalysis,
    analysisSource?.summary,
  ].filter(Boolean);

  const parts = [];
  for (const source of sources) {
    parts.push(
      source.summary?.careerDirection,
      source.summary?.projectType,
      source.careerDirection,
      source.projectType,
      source.skillVector,
      source.topSkills,
      source.skills,
      source.skillSignals,
      source.packages,
      source.frameworks,
      source.languages,
      source.configs,
    );
  }

  return parts;
};

const buildRepositoryEvidence = (payload = {}, options = {}) => {
  const repository = payload.repository || {};
  const packageRecords = toArray(payload.packages || payload.packageRecord).filter(Boolean);
  const commits = toArray(payload.commits).filter(Boolean);
  const pullRequests = toArray(payload.pullRequests).filter(Boolean).slice(0, 5);
  const issues = toArray(payload.issues).filter(Boolean);
  const contributionSummary = payload.contributionSummary || null;
  const analysisSource = payload.analysisSource || {};

  const repoParts = [
    repository.name,
    repository.repoName,
    repository.fullName,
    repository.description,
    repository.topics,
    repository.language,
    repository.languages,
    repository.defaultBranch,
    repository.rawData?.name,
    repository.rawData?.full_name,
    repository.rawData?.description,
    repository.rawData?.topics,
    repository.rawData?.language,
    getRepositoryReadmeParts(repository),
  ];

  for (const packageRecord of packageRecords) {
    repoParts.push(
      typeof packageRecord === 'string' ? packageRecord : '',
      packageRecord.name,
      packageRecord.packageName,
      packageRecord.packages,
      objectKeys(packageRecord.dependencies),
      packageRecord.dependencies,
      objectKeys(packageRecord.devDependencies),
      packageRecord.devDependencies,
      objectKeys(packageRecord.peerDependencies),
      packageRecord.peerDependencies,
      packageRecord.scripts,
      packageRecord.frameworks,
      packageRecord.configs,
      packageRecord.detectedFrameworks,
      packageRecord.packageFiles,
      packageRecord.detectedFiles,
      packageRecord.languages,
      packageRecord.rawData?.packageJson,
      objectKeys(packageRecord.rawData?.dependencies),
      packageRecord.rawData?.dependencies,
      objectKeys(packageRecord.rawData?.devDependencies),
      packageRecord.rawData?.devDependencies,
      packageRecord.rawData?.scripts,
    );
  }

  for (const commit of commits) {
    repoParts.push(
      commit.sha ? String(commit.sha).slice(0, 12) : '',
      commit.message,
      getCommitChangedFiles(commit),
    );
  }

  for (const pullRequest of pullRequests) {
    repoParts.push(
      pullRequest.title ? `user pull request ${pullRequest.title}` : '',
      pullRequest.body,
      toArray(pullRequest.changedPaths).slice(0, 20),
    );
  }

  repoParts.push(extractAnalysisParts(analysisSource));

  const legacyIssueDocument = buildIssueDocument(issues, options);
  const availableFiles = packageRecords.flatMap((packageRecord) => toArray(packageRecord?.detectedFiles));
  const cachedSourceUsage = packageRecords
    .map((packageRecord) => packageRecord?.rawData?.__sourceUsageCache)
    .filter((cache) => cache && cache.sourceUsageParserVersion === SOURCE_USAGE_PARSER_VERSION && Array.isArray(cache.tokens));
  const sourceUsage = cachedSourceUsage.length && cachedSourceUsage.length === packageRecords.length
    ? {
        tokens: [...new Set(cachedSourceUsage.flatMap((cache) => cache.tokens || []))],
        files: [],
        skipped: [],
        totalChars: cachedSourceUsage.reduce((sum, cache) => sum + Number(cache.totalChars || 0), 0),
        fromCache: true,
      }
    : parseSourceUsageEvidence(availableFiles, {
        limits: options.sourceUsageLimits,
      });

  let apiTokens = normalizeApiTokens([
    packageRecords,
    sourceUsage.tokens,
    analysisSource?.packages,
    analysisSource?.frameworks,
    analysisSource?.detectedFrameworks,
    analysisSource?.languages,
    analysisSource?.configs,
    analysisSource?.analysis?.packages,
    analysisSource?.analysis?.frameworks,
    analysisSource?.latestAnalysis?.packages,
    analysisSource?.latestAnalysis?.frameworks,
  ], options);
  const sourceEvidence = collectRepoEvidenceFiles(availableFiles, options);
  const userContributionEvidence = buildUserContributionFiles({
    commits,
    availableFiles,
    options,
  });
  const metadataDocument = normalizeTextParts(repoParts, {
    maxLength: Math.max(1000, Math.floor((options.repoMaxLength || DEFAULT_REPO_TEXT_LIMIT) / 3)),
  });
  let repoDocument = buildRepoDocumentWithSourceEvidence({
    metadataText: metadataDocument,
    apiTokens,
    commits,
    sourceFiles: sourceEvidence.sourceFiles,
    userContributionFiles: userContributionEvidence.sourceFiles,
  });
  const repoResult = buildRepoDocument({ repository, commits, pullRequests, contributionSummary: contributionSummary || {} });
  const apiResult = buildApiEvidence(repoResult.attributedFiles, options.apiEvidenceOptions);
  const issueResult = buildAttributedIssueDocument(issues);
  repoDocument = repoResult.repoDocument;
  apiTokens = contributionSummary?.accepted === true ? apiResult.apiTokens : [];
  const issueOverride = compactString(
    payload.channelStatus?.issue || payload.evidenceChannels?.channelStatus?.issue || options.channelStatus?.issue,
  ).toLowerCase();
  const issueStatusAllowsContent = !issueOverride || issueOverride === 'available';
  const issueDocument = issueStatusAllowsContent ? issueResult.issueDocument : '';
  const repoAvailable = contributionSummary?.accepted === true && Boolean(repoDocument.trim());
  const issueAvailable = Boolean(issueDocument.trim());
  const apiAvailable = contributionSummary?.accepted === true && apiTokens.length > 0;
  const evidenceChannels = {
    availableChannels: { repo: repoAvailable, issue: issueAvailable, api: apiAvailable },
    channelStatus: {
      repo: repoAvailable ? 'available' : (contributionSummary?.status || 'contribution_unverified'),
      issue: issueAvailable ? 'available' : (issueOverride && issueOverride !== 'available' ? issueOverride : 'empty'),
      api: apiAvailable ? 'available' : (contributionSummary?.accepted === true ? 'no_usage_tokens' : (contributionSummary?.status || 'contribution_unverified')),
    },
  };

  return {
    repoDocument,
    issueDocument,
    apiTokens,
    evidenceChannels,
    commits,
    issues,
    packageRecords,
    sourceFiles: sourceEvidence.sourceFiles,
    userContributionFiles: userContributionEvidence.sourceFiles,
    excludedSourceFileCount: sourceEvidence.excludedFileCount,
    excludedUserContributionFileCount: userContributionEvidence.excludedFileCount,
    sourceEvidenceCharCount: sourceEvidence.sourceEvidenceCharCount,
    issueCount: issues.length,
    sourceUsage,
    pullRequests,
    contributionSummary,
    inputDiagnostics: {
      ...repoResult.diagnostics,
      ...apiResult.diagnostics,
      ...issueResult.diagnostics,
      droppedWholeRepoSourceCount: availableFiles.length,
      droppedUnattributedTokenCount: normalizeApiTokens([
        packageRecords, sourceUsage.tokens, analysisSource?.packages, analysisSource?.frameworks,
      ], options).length,
      legacyIssueTextLength: legacyIssueDocument.length,
    },
  };
};

const buildEvidencePreview = (payload = {}, options = {}) => {
  const limits = {
    ...PREVIEW_LIMITS,
    ...(options.previewLimits || {}),
  };
  const commits = toArray(payload.commits)
    .filter(Boolean)
    .slice(0, limits.commits)
    .map((commit) => ({
      sha: commit.sha || '',
      message: compactString(commit.message).slice(0, 300),
      date: commit.authorDate || commit.committerDate || commit.date || null,
      changedFiles: getCommitChangedFiles(commit).slice(0, limits.changedFilesPerCommit),
    }));

  const issues = toArray(payload.issues)
    .filter(Boolean)
    .slice(0, limits.issues)
    .map((issue) => ({
      number: issue.number || issue.id || null,
      title: compactString(issue.title).slice(0, 300),
      labels: getIssueLabels(issue).slice(0, 20),
      state: issue.state || '',
      url: issue.url || issue.htmlUrl || issue.html_url || '',
    }));

  return {
    commits,
    issues,
    apiTokens: normalizeApiTokens(payload.apiTokens || [], options).slice(0, limits.apiTokens),
    docs: payload.docs || detectDocumentationEvidence([]),
    sourceFiles: toArray(payload.sourceFiles).map((file) => ({
      path: file.path,
      category: file.category,
      secondaryCategories: file.secondaryCategories || [],
      roleHints: file.roleHints || [],
      matchedKeywords: file.matchedKeywords || [],
      matchedSignals: file.matchedSignals || [],
      specificityLevel: file.specificityLevel || 'generic',
      snippetCharCount: file.snippetCharCount || 0,
    })),
    repoFeatures: payload.repoFeatureEvidence || {},
    userContributionFiles: toArray(payload.userContributionFiles).map((file) => ({
      path: file.path,
      category: file.category,
      secondaryCategories: file.secondaryCategories || [],
      roleHints: file.roleHints || [],
      matchedSignals: file.matchedSignals || [],
      specificityLevel: file.specificityLevel || 'generic',
    })),
  };
};

const countChangedFiles = (commits) => {
  const files = new Set();
  for (const commit of toArray(commits)) {
    for (const file of getCommitChangedFiles(commit)) {
      files.add(file.toLowerCase());
    }
  }
  return files.size;
};

const countPackageFiles = (packageRecords) => {
  const files = new Set();
  for (const packageRecord of toArray(packageRecords)) {
    for (const file of toArray(packageRecord?.packageFiles)) {
      const text = compactString(file);
      if (text) files.add(text.toLowerCase());
    }
    for (const file of toArray(packageRecord?.detectedFiles)) {
      const text = compactString(getChangedFilePath(file));
      if (text) files.add(text.toLowerCase());
    }
  }
  return files.size;
};

const collectDocumentationFilePaths = ({ packageRecords, commits }) => {
  const paths = [];
  for (const packageRecord of toArray(packageRecords)) {
    paths.push(...toArray(packageRecord?.packageFiles));
    paths.push(...toArray(packageRecord?.detectedFiles));
  }
  for (const commit of toArray(commits)) {
    paths.push(...getCommitChangedFiles(commit));
  }
  return paths;
};

const countSourceFilesByCategory = (sourceFiles, category) => (
  toArray(sourceFiles).filter((file) => file.category === category || toArray(file.secondaryCategories).includes(category)).length
);

const countSourceFilesByRole = (sourceFiles, role) => (
  toArray(sourceFiles).filter((file) => toArray(file.roleHints).includes(role)).length
);

const buildCategoryCounts = (sourceFiles) => CATEGORY_PRIORITY.reduce((counts, category) => {
  const count = countSourceFilesByCategory(sourceFiles, category);
  if (count) counts[category] = count;
  return counts;
}, {});

const buildDev2VecInputFromRepositoryAnalysis = (payload = {}, options = {}) => {
  const evidence = buildRepositoryEvidence(payload, options);
  const topN = clampTopN(payload.topN ?? options.topN);
  const requestId = normalizeRequestId(payload.requestId || options.requestId);
  const evidencePayload = {
    commits: evidence.commits,
    issues: evidence.issues,
    pullRequests: evidence.pullRequests,
    apiTokens: evidence.apiTokens,
    sourceFiles: evidence.sourceFiles,
    userContributionFiles: evidence.userContributionFiles,
    docs: detectDocumentationEvidence(collectDocumentationFilePaths({
      packageRecords: evidence.packageRecords,
      commits: evidence.commits,
    })),
  };
  const docsEvidence = evidencePayload.docs;
  const repoFeatureEvidence = detectRepoFeatureEvidence({
    apiTokens: evidence.apiTokens,
    sourceFiles: evidence.sourceFiles,
    docsEvidence,
  });
  evidencePayload.repoFeatureEvidence = repoFeatureEvidence;

  return {
    requestId,
    repoDocument: evidence.repoDocument,
    issueDocument: evidence.issueDocument,
    apiTokens: evidence.apiTokens,
    evidenceChannels: evidence.evidenceChannels,
    topN,
    sourceStats: {
      repoTextLength: evidence.repoDocument.length,
      issueTextLength: evidence.issueDocument.length,
      apiTokenCount: evidence.apiTokens.length,
      commitCount: evidence.commits.length,
      changedFileCount: countChangedFiles(evidence.commits),
      issueCount: evidence.issues.length,
      pullRequestCount: evidence.pullRequests.length,
      contributionSummary: evidence.contributionSummary,
      ...(evidence.inputDiagnostics || {}),
      packageFileCount: countPackageFiles(evidence.packageRecords),
      markdownFileCount: docsEvidence.markdownFileCount,
      readmeRootExists: docsEvidence.readmeRootExists,
      hasDocsDirectory: docsEvidence.hasDocsDirectory,
      documentationStatus: docsEvidence.documentationStatus,
      sourceFileCount: evidence.sourceFiles.length,
      userContributionFileCount: evidence.userContributionFiles.length,
      userContributionBackendFileCount: countSourceFilesByRole(evidence.userContributionFiles, 'backend'),
      userContributionFrontendFileCount: countSourceFilesByRole(evidence.userContributionFiles, 'frontend'),
      userContributionMobileFileCount: countSourceFilesByRole(evidence.userContributionFiles, 'mobile'),
      userContributionDevopsFileCount: countSourceFilesByRole(evidence.userContributionFiles, 'devops'),
      userContributionDataFileCount: countSourceFilesByRole(evidence.userContributionFiles, 'data'),
      sourceUsageFromCache: evidence.sourceUsage?.fromCache === true,
      sourceEvidenceCharCount: evidence.sourceEvidenceCharCount,
      backendFileCount: countSourceFilesByRole(evidence.sourceFiles, 'backend'),
      frontendFileCount: countSourceFilesByRole(evidence.sourceFiles, 'frontend'),
      mobileFileCount: countSourceFilesByRole(evidence.sourceFiles, 'mobile'),
      devopsFileCount: countSourceFilesByRole(evidence.sourceFiles, 'devops'),
      dataFileCount: countSourceFilesByRole(evidence.sourceFiles, 'data'),
      categoryCounts: buildCategoryCounts(evidence.sourceFiles),
      restApiFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'backend_route') + countSourceFilesByCategory(evidence.sourceFiles, 'backend_api'),
      databaseFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'backend_database') + countSourceFilesByCategory(evidence.sourceFiles, 'backend_model'),
      authFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'backend_authentication') + countSourceFilesByCategory(evidence.sourceFiles, 'backend_middleware'),
      dockerFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'devops_container'),
      documentationFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'documentation'),
      testingFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'testing'),
      devopsCiFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'devops_ci_cd'),
      mlServiceFileCount: countSourceFilesByCategory(evidence.sourceFiles, 'ml_service'),
      excludedFileCount: evidence.excludedSourceFileCount,
      excludedUserContributionFileCount: evidence.excludedUserContributionFileCount,
    },
    repoFeatureEvidence,
    evidencePreview: buildEvidencePreview(evidencePayload, options),
  };
};

// Deprecated legacy synthetic input builder. Active role/roadmap flows must never infer from merged analyses.
const buildDev2VecInputFromAnalysisSource = (analysisSource = {}, options = {}) => {
  const source = analysisSource || {};
  const repositories = toArray(source.repositories || source.repository).filter(Boolean);
  const repository = source.repository || repositories[0] || {
    name: source.repoName,
    repoName: source.repoName,
    fullName: source.fullName,
  };

  const packages = [
    source.packages,
    source.packageRecord,
    source.packageRecords,
    source.analysis?.packages,
    source.latestAnalysis?.packages,
  ].flatMap(toArray).filter(Boolean);

  const commits = [
    source.commits,
    source.commitSnapshot?.commits,
    source.analysis?.commits,
    source.latestAnalysis?.commits,
  ].flatMap(toArray).filter(Boolean);

  const issues = [
    source.issues,
    source.issueSnapshot?.issues,
    source.analysis?.issues,
    source.analysis?.rawAnalysis?.issueEvidence?.issues,
    source.latestAnalysis?.issues,
    source.latestAnalysis?.rawAnalysis?.issueEvidence?.issues,
  ].flatMap(toArray).filter(Boolean);
  const hasAnalysis = Boolean(source.analysis || source.latestAnalysis);
  const hasChannelMetadata = Boolean(
    source.evidenceChannels
    || source.rawAnalysis?.evidenceChannels
    || source.analysis?.rawAnalysis?.evidenceChannels
    || source.latestAnalysis?.rawAnalysis?.evidenceChannels
  );
  const channelStatus = hasAnalysis && !hasChannelMetadata
    ? { issue: 'legacy_snapshot', api: 'legacy_snapshot' }
    : (
        source.evidenceChannels?.channelStatus
        || source.rawAnalysis?.evidenceChannels?.channelStatus
        || source.analysis?.rawAnalysis?.evidenceChannels?.channelStatus
        || source.latestAnalysis?.rawAnalysis?.evidenceChannels?.channelStatus
        || source.channelStatus
      );

  return buildDev2VecInputFromRepositoryAnalysis({
    repository,
    packages,
    commits,
    issues,
    channelStatus,
    analysisSource: source,
    topN: source.topN ?? options.topN,
    requestId: source.requestId || options.requestId,
  }, options);
};

module.exports = {
  buildDev2VecInputFromRepositoryAnalysis,
  buildDev2VecInputFromAnalysisSource,
  buildRepositoryEvidence,
  collectRepoEvidenceFiles,
  buildRepoDocumentWithSourceEvidence,
  detectRepoFeatureEvidence,
  normalizeTextParts,
  normalizeApiTokens,
  buildEvidencePreview,
};
