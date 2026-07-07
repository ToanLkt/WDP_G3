const IGNORED_PREFIXES = [
  'node_modules/',
  '.git/',
  '.venv/',
  'venv/',
  'tmp/',
  'temp/',
];

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizePath = (value) => (
  String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
);

const getPathFromValue = (value) => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.path || value.filename || value.fileName || value.name || '';
};

const isIgnoredPath = (filePath) => {
  const lower = filePath.toLowerCase();
  return IGNORED_PREFIXES.some((prefix) => lower === prefix.slice(0, -1) || lower.startsWith(prefix));
};

const uniquePaths = (values) => {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const filePath = normalizePath(getPathFromValue(value));
    const key = filePath.toLowerCase();
    if (!filePath || seen.has(key) || isIgnoredPath(filePath)) continue;
    seen.add(key);
    output.push(filePath);
  }
  return output;
};

const isRootPath = (filePath) => !filePath.includes('/');
const isMarkdown = (filePath) => /\.md$/i.test(filePath);
const isRootReadme = (filePath) => isRootPath(filePath) && /^readme(?:\.md)?$/i.test(filePath);
const isDocsPath = (filePath) => /^(docs|documentation|documentations)\//i.test(filePath);

const getDocumentationStatus = ({ readmeRootExists, markdownFileCount, hasDocsDirectory }) => {
  if (readmeRootExists && (markdownFileCount > 1 || hasDocsDirectory)) return 'root_readme_and_docs';
  if (readmeRootExists) return 'root_readme_only';
  if (markdownFileCount > 0 || hasDocsDirectory) return 'markdown_docs_without_root_readme';
  return 'no_markdown_docs';
};

const detectDocumentationEvidence = (filePaths) => {
  const paths = uniquePaths(toArray(filePaths));
  if (paths.length === 0) {
    return {
      readmeRootExists: false,
      readmeFiles: [],
      rootMarkdownFiles: [],
      docsMarkdownFiles: [],
      markdownFileCount: 0,
      hasDocsDirectory: false,
      documentationStatus: 'unknown',
    };
  }

  const readmeFiles = paths.filter((filePath) => /(^|\/)readme(?:\.md)?$/i.test(filePath));
  const rootMarkdownFiles = paths.filter((filePath) => isRootPath(filePath) && isMarkdown(filePath));
  const docsMarkdownFiles = paths.filter((filePath) => isDocsPath(filePath) && isMarkdown(filePath));
  const markdownFileCount = paths.filter(isMarkdown).length;
  const hasDocsDirectory = paths.some((filePath) => /^(docs|documentation|documentations)(\/|$)/i.test(filePath));
  const readmeRootExists = paths.some(isRootReadme);

  return {
    readmeRootExists,
    readmeFiles,
    rootMarkdownFiles,
    docsMarkdownFiles,
    markdownFileCount,
    hasDocsDirectory,
    documentationStatus: getDocumentationStatus({
      readmeRootExists,
      markdownFileCount,
      hasDocsDirectory,
    }),
  };
};

const buildDocumentationRecommendation = (docs = {}) => {
  if (docs.documentationStatus === 'unknown') {
    return 'Chua du du lieu de danh gia tai lieu du an.';
  }

  if (docs.readmeRootExists && Number(docs.markdownFileCount || 0) > 1) {
    return 'Chuan hoa README root de lien ket cac tai lieu Markdown quan trong va bo sung huong dan setup/run/test/deploy neu can.';
  }

  if (!docs.readmeRootExists && Number(docs.markdownFileCount || 0) > 0) {
    return 'Repo co tai lieu Markdown, nhung nen them README.md o root lam trang dieu huong chinh.';
  }

  if (!docs.readmeRootExists && Number(docs.markdownFileCount || 0) === 0 && docs.hasDocsDirectory !== true) {
    return 'Repo chua co README/tai lieu Markdown ro rang.';
  }

  return '';
};

module.exports = {
  detectDocumentationEvidence,
  buildDocumentationRecommendation,
};
