const DEFAULT_LIMITS = {
  maxFiles: 60,
  maxCharsPerFile: 4000,
  maxTotalChars: 60000,
  maxTokensPerFile: 30,
  maxTokensTotal: 140,
};

const SKIP_PATH_PATTERNS = [
  /(^|\/)node_modules\//i,
  /(^|\/)vendor\//i,
  /(^|\/)(dist|build|coverage|out|target)\//i,
  /(^|\/)\.git\//i,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i,
  /\.min\.[a-z0-9]+$/i,
  /\.map$/i,
];

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const unique = (values = [], limit = DEFAULT_LIMITS.maxTokensTotal) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = compact(value).toLowerCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
};

const normalizeLibraryName = (value = '') => {
  const text = String(value || '').trim().replace(/^["']|["']$/g, '');
  if (!text || text.startsWith('.') || text.startsWith('/') || text.startsWith('..')) return '';
  if (/^[a-zA-Z]:[\\/]/.test(text)) return '';
  if (/^https?:\/\//i.test(text)) return '';
  if (text.startsWith('package:')) return text.replace(/^package:/, '').split('/').slice(0, 2).join('/');
  return text.replace(/\\/g, '/').split('/').slice(0, text.startsWith('@') ? 2 : 1).join('/');
};

const token = (prefix, value) => {
  const normalized = compact(value).toLowerCase().replace(/[^a-z0-9@._+/#:-]+/g, '');
  return normalized ? `${prefix}:${normalized}` : '';
};

const extensionOf = (path) => {
  const lower = normalizePath(path).toLowerCase();
  const match = lower.match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
};

const getContent = (file = {}, maxChars = DEFAULT_LIMITS.maxCharsPerFile) => (
  String(file.sourceContent || file.content || file.contentPreview || '').slice(0, maxChars)
);

const isSkippableFile = (path, content = '') => {
  const normalized = normalizePath(path);
  if (!normalized || SKIP_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const text = String(content || '');
  if (!text.trim()) return true;
  const averageLineLength = text.length / Math.max(1, text.split(/\r?\n/).length);
  return averageLineLength > 500;
};

const detectProjectContext = (files = []) => {
  const combined = files
    .map((file) => `${normalizePath(file.path || file.fileName || file.name)}\n${getContent(file, 1200)}`)
    .join('\n')
    .toLowerCase();
  return {
    frontend: /react|react-dom|vite|vue|@angular|svelte|tailwind|src\/(components|pages|views|hooks)/.test(combined),
    mobile: /react-native|expo|flutter|swiftui|androidmanifest|pubspec\.yaml|package:flutter/.test(combined),
    backend: /express|fastify|koa|nestjs|springframework|flask|django|router\.(get|post|put|patch|delete)|app\.(get|post|put|patch|delete)/.test(combined),
    data: /pandas|sklearn|scikit-learn|tensorflow|torch|mlflow|jupyter|\.ipynb/.test(combined),
    devops: /dockerfile|docker compose|kubectl|terraform|kubernetes|github\/workflows|kind:\s*(deployment|service|pod)/.test(combined),
  };
};

const inferFileContext = (path, content, projectContext = {}) => {
  const lowerPath = normalizePath(path).toLowerCase();
  const lowerContent = String(content || '').toLowerCase();
  return {
    frontend: projectContext.frontend && (
      /\.(jsx|tsx|vue|svelte|css|scss|sass|less)$/.test(lowerPath)
      || /src\/(components|pages|views|hooks|context|store|layouts|styles|services|api)\//.test(lowerPath)
      || /react|useeffect|usestate|axios|fetch\(/.test(lowerContent)
    ),
    mobile: projectContext.mobile && (
      /\.(dart|swift|kt|kts)$/.test(lowerPath)
      || /(^|\/)(mobile|screens|navigation|android|ios|lib|widgets)\//.test(lowerPath)
      || /react-native|expo|flutter|swiftui|navigator\.push/.test(lowerContent)
    ),
    backend: projectContext.backend && (
      /(^|\/)(server|routes|controllers|middleware|middlewares|models|repositories|entities)\//.test(lowerPath)
      || /(^|\/)(server|app)\.[cm]?[jt]s$/.test(lowerPath)
      || /express|router\.(get|post|put|patch|delete)|app\.(get|post|put|patch|delete)|mongoose|prisma/.test(lowerContent)
    ),
    data: projectContext.data || /(^|\/)(notebooks|data|datasets|training|preprocessing|models)\//.test(lowerPath),
    devops: projectContext.devops || /dockerfile|\.ya?ml$|\.tf$|\.sh$|jenkinsfile|\.gitlab-ci/.test(lowerPath),
  };
};

const collectMatches = (content, regex, mapper) => {
  const output = [];
  let match;
  const pattern = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  while ((match = pattern.exec(content)) !== null) {
    const value = mapper(match);
    if (value) output.push(value);
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return output;
};

const parseImports = (path, content) => {
  const ext = extensionOf(path);
  const imports = [];

  if (/\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte)$/.test(ext)) {
    imports.push(...collectMatches(content, /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g, (m) => normalizeLibraryName(m[1])));
    imports.push(...collectMatches(content, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (m) => normalizeLibraryName(m[1])));
    imports.push(...collectMatches(content, /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.py') {
    imports.push(...collectMatches(content, /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm, (m) => normalizeLibraryName(m[1].split(',')[0].trim().split(/\s+as\s+/i)[0])));
    imports.push(...collectMatches(content, /^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.dart') {
    imports.push(...collectMatches(content, /^\s*import\s+['"]([^'"]+)['"]/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.swift') {
    imports.push(...collectMatches(content, /^\s*import\s+([A-Za-z0-9_]+)/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.kt' || ext === '.kts' || ext === '.java') {
    imports.push(...collectMatches(content, /^\s*import\s+([A-Za-z0-9_.]+)/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.cs') {
    imports.push(...collectMatches(content, /^\s*using\s+([A-Za-z0-9_.]+)\s*;/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.go') {
    imports.push(...collectMatches(content, /^\s*import\s+(?:\(\s*)?["`]([^"`]+)["`]/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.php') {
    imports.push(...collectMatches(content, /^\s*use\s+([A-Za-z0-9_\\]+)\s*;/gm, (m) => normalizeLibraryName(m[1])));
  } else if (ext === '.rb') {
    imports.push(...collectMatches(content, /^\s*require\s+['"]([^'"]+)['"]/gm, (m) => normalizeLibraryName(m[1])));
  }

  return unique(imports.map((item) => token('import', item)).filter(Boolean), 25);
};

const parseJavaScriptCalls = (content, context) => {
  const calls = [];
  const routeRegex = /\b(?:app|router|server)\s*\.\s*(get|post|put|patch|delete|use)\s*\(/gi;
  calls.push(...collectMatches(content, routeRegex, (m) => token('server_route', `express.${m[1]}`)));
  calls.push(...collectMatches(content, /\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(/gi, (m) => (
    context.backend && !context.frontend && !context.mobile ? token('client_http', `axios.${m[1]}`) : token('client_http', `axios.${m[1]}`)
  )));
  calls.push(...collectMatches(content, /\bfetch\s*\(/gi, () => token(context.mobile ? 'mobile_http' : 'client_http', 'fetch')));
  calls.push(...collectMatches(content, /\b(useState|useEffect|useMemo|useCallback|createContext|useSelector)\s*\(/g, (m) => token('frontend_hook', m[1])));
  calls.push(...collectMatches(content, /\bmongoose\s*\.\s*(connect|model|schema)\s*\(/gi, (m) => token('database', `mongoose.${m[1]}`)));
  calls.push(...collectMatches(content, /\bprisma\s*\.\s*[a-zA-Z0-9_]+\s*\.\s*(findMany|findUnique|create|update|delete)\s*\(/g, (m) => token('database', `prisma.${m[1]}`)));
  calls.push(...collectMatches(content, /\bjwt\s*\.\s*(sign|verify)\s*\(/gi, (m) => token('auth', `jwt.${m[1]}`)));
  calls.push(...collectMatches(content, /\bbcrypt(?:js)?\s*\.\s*(compare|hash)\s*\(/gi, (m) => token('auth', `bcrypt.${m[1]}`)));
  calls.push(...collectMatches(content, /\bcreateNativeStackNavigator\s*\(/g, () => token('mobile_navigation', 'createnativestacknavigator')));
  calls.push(...collectMatches(content, /\bAsyncStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(/g, (m) => token('mobile_storage', m[1])));
  calls.push(...collectMatches(content, /\bLocation\s*\.\s*(getCurrentPositionAsync|watchPositionAsync)\s*\(/g, (m) => token('mobile_location', m[1])));
  return calls;
};

const parsePythonCalls = (content) => [
  ...collectMatches(content, /\bpd\s*\.\s*(read_csv|read_excel|DataFrame)\s*\(/g, (m) => token('data_io', `pandas.${m[1]}`)),
  ...collectMatches(content, /\btrain_test_split\s*\(/g, () => token('ml_preprocess', 'train_test_split')),
  ...collectMatches(content, /\b[a-zA-Z_][a-zA-Z0-9_]*\s*\.\s*(fit|predict|transform|fit_transform)\s*\(/g, (m) => token(m[1] === 'predict' ? 'ml_infer' : 'ml_train', `model.${m[1]}`)),
  ...collectMatches(content, /\bmlflow\s*\.\s*(log_metric|log_param|start_run)\s*\(/g, (m) => token('ml_tracking', `mlflow.${m[1]}`)),
  ...collectMatches(content, /\btorch\s*\.\s*nn\b/g, () => token('ml_framework', 'torch.nn')),
];

const parseOtherCalls = (path, content, context) => {
  const ext = extensionOf(path);
  const calls = [];
  if (ext === '.dart') {
    calls.push(...collectMatches(content, /\bNavigator\s*\.\s*push\s*\(/g, () => token('mobile_navigation', 'navigator.push')));
    calls.push(...collectMatches(content, /\bFirebaseAuth\b[\s\S]{0,80}\b(signIn|createUser|signOut)/g, (m) => token('mobile_auth', `firebaseauth.${m[1]}`)));
  }
  if (ext === '.swift') {
    calls.push(...collectMatches(content, /\bAlamofire\s*\.\s*request\s*\(/g, () => token('client_http', 'alamofire.request')));
  }
  if (ext === '.java' || ext === '.kt' || ext === '.kts') {
    calls.push(...collectMatches(content, /@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)\b/g, (m) => token('server_route', `spring.${m[1]}`)));
  }
  if (ext === '.cs') {
    calls.push(...collectMatches(content, /\[(HttpGet|HttpPost|HttpPut|HttpDelete|Route)\b[^\]]*]/g, (m) => token('server_route', `aspnet.${m[1]}`)));
  }
  if (context.devops || /\.(ya?ml|tf|sh|bash|ps1|dockerfile)$/.test(ext) || /dockerfile$/i.test(path)) {
    calls.push(...collectMatches(content, /\bdocker\s+(build|compose|run|push)\b/gi, (m) => token('devops_docker', m[1])));
    calls.push(...collectMatches(content, /\bkubectl\s+(apply|delete|rollout|scale)\b/gi, (m) => token('devops_kubernetes', m[1])));
    calls.push(...collectMatches(content, /\bterraform\s+(plan|apply|init|destroy)\b/gi, (m) => token('devops_terraform', m[1])));
    calls.push(...collectMatches(content, /^\s*-\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@[A-Za-z0-9_.-]+)?/gm, (m) => token('devops_github_action', m[1])));
    calls.push(...collectMatches(content, /^\s*kind:\s*(Deployment|Service|Pod|Ingress|ConfigMap)\b/gim, (m) => token('devops_kubernetes_kind', m[1])));
    calls.push(...collectMatches(content, /\bresource\s+["']([a-zA-Z0-9_]+)["']/g, (m) => token('devops_terraform_resource', m[1])));
  }
  return calls;
};

const parseApiCalls = (path, content, context) => {
  const ext = extensionOf(path);
  if (/\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte)$/.test(ext)) return parseJavaScriptCalls(content, context);
  if (ext === '.py') return parsePythonCalls(content);
  return parseOtherCalls(path, content, context);
};

const parseSourceUsageFile = (file = {}, projectContext = {}, options = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const path = normalizePath(file.path || file.fileName || file.name);
  const content = getContent(file, limits.maxCharsPerFile);
  if (isSkippableFile(path, content)) return { path, imports: [], apiCalls: [], tokens: [] };

  try {
    const fileContext = inferFileContext(path, content, projectContext);
    const imports = parseImports(path, content);
    const apiCalls = parseApiCalls(path, content, fileContext);
    const tokens = unique([...imports, ...apiCalls], limits.maxTokensPerFile);
    return { path, imports, apiCalls, tokens, context: fileContext };
  } catch (error) {
    return { path, imports: [], apiCalls: [], tokens: [], error: error.message };
  }
};

const parseSourceUsageEvidence = (files = [], options = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const rawFiles = Array.isArray(files) ? files.slice(0, limits.maxFiles) : [];
  const projectContext = detectProjectContext(rawFiles);
  const parsedFiles = [];
  const tokens = [];
  let totalChars = 0;

  for (const file of rawFiles) {
    const content = getContent(file, limits.maxCharsPerFile);
    totalChars += content.length;
    if (totalChars > limits.maxTotalChars) break;
    const parsed = parseSourceUsageFile(file, projectContext, { limits });
    if (parsed.tokens.length || parsed.error) parsedFiles.push(parsed);
    tokens.push(...parsed.tokens);
    if (tokens.length >= limits.maxTokensTotal) break;
  }

  return {
    tokens: unique(tokens, limits.maxTokensTotal),
    files: parsedFiles,
    projectContext,
  };
};

module.exports = {
  parseSourceUsageEvidence,
  parseSourceUsageFile,
  normalizeLibraryName,
};
