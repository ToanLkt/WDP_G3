const path = require('path');

const API_EVIDENCE_VERSION = 'dev2vec-api-evidence-v3-python-toml-parity';
const MIN_IMPORT_FREQUENCY = 5;
const VALID_TOKEN = /^[a-z0-9@._+/#:-]{2,100}$/;

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').trim();
const normalizeToken = (value) => {
  let token = String(value || '').trim().toLowerCase().replace(/^["'`,]+|["'`,]+$/g, '');
  if (!token || token.startsWith('./') || token.startsWith('../') || token.startsWith('/')
    || token.startsWith('http://') || token.startsWith('https://') || token.startsWith('@/') || token.startsWith('~/')) return '';
  if (token.startsWith('@')) {
    token = token.split('/').slice(0, 2).join('/');
  } else if (token.includes('/') && !token.startsWith('github.com/') && !token.startsWith('gitlab.com/')) {
    token = token.split('/', 1)[0];
  }
  return VALID_TOKEN.test(token) ? token : '';
};

const add = (set, value) => { const token = normalizeToken(value); if (token) set.add(token); };
const cleanPatch = (text) => String(text || '').split(/\r?\n/)
  .filter((line) => !line.startsWith('+++') && !line.startsWith('---') && !line.startsWith('@@'))
  .map((line) => (/^[+\- ]/.test(line) ? line.slice(1) : line)).join('\n');

const parseJson = (text) => { try { return JSON.parse(text); } catch (_) { return null; } };
const parseDependencyTokens = (filePath, text) => {
  const tokens = new Set();
  const logicalPath = normalizePath(filePath);
  const name = path.posix.basename(logicalPath).toLowerCase();
  const content = String(text || '');
  if (['package.json', 'composer.json'].includes(name)) {
    const data = parseJson(content);
    const sections = name === 'package.json' ? ['dependencies', 'devDependencies', 'peerDependencies'] : ['require', 'require-dev'];
    sections.forEach((section) => Object.keys(data?.[section] || {}).forEach((key) => add(tokens, key)));
  } else if (name === 'package-lock.json') {
    const data = parseJson(content);
    Object.keys(data?.dependencies || {}).forEach((key) => add(tokens, key));
    Object.keys(data?.packages || {}).filter((key) => key.startsWith('node_modules/'))
      .forEach((key) => add(tokens, key.replace(/^node_modules\//, '')));
  } else if (['yarn.lock', 'pnpm-lock.yaml'].includes(name)) {
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s{0,4}["']?(@?[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)@/);
      if (match) add(tokens, match[1]);
    }
  } else if (name === 'requirements.txt') {
    content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
      .forEach((line) => add(tokens, line.split(/\s*(?:==|>=|<=|~=|!=|>|<|\[|;|\s@)\s*/, 1)[0]));
  } else if (['pipfile', 'gemfile'].includes(name)) {
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/\s*(?:gem\s+)?["']?([a-zA-Z0-9_.-]+)["']?\s*(?:=|,)/);
      if (match) add(tokens, match[1]);
    }
  } else if (['pyproject.toml', 'cargo.toml'].includes(name)) {
    let section = '';
    for (const line of content.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)]/);
      if (header) { section = header[1].toLowerCase(); continue; }
      if (section.includes('dependenc')) {
        const key = line.match(/^\s*([a-zA-Z0-9_.-]+)\s*=/); if (key) add(tokens, key[1]);
      }
      const arrayItem = line.match(/["']([a-zA-Z0-9@._+/-]+)(?:\[[^\]]+])?\s*(?:[<>=!~; ].*)?["']/);
      if (arrayItem && (section.includes('dependencies') || line.includes('dependencies'))) add(tokens, arrayItem[1]);
    }
  } else if (name === 'pom.xml') {
    [...content.matchAll(/<(?:groupId|artifactId)>([^<]+)<\/(?:groupId|artifactId)>/g)].forEach((match) => add(tokens, match[1]));
  } else if (['build.gradle', 'build.gradle.kts'].includes(name)) {
    [...content.matchAll(/(?:implementation|testImplementation|api|compileOnly|runtimeOnly)\s*[\(\s]["']([^"']+)["']/g)]
      .forEach((match) => match[1].split(':').slice(0, 2).forEach((part) => add(tokens, part)));
  } else if (name === 'pubspec.yaml') {
    let active = false;
    for (const line of content.split(/\r?\n/)) {
      if (/^(dependencies|dev_dependencies):\s*$/.test(line)) active = true;
      else if (active && /^\s{2}[a-zA-Z0-9_.-]+:/.test(line)) add(tokens, line.trim().split(':')[0]);
      else if (line && !line.startsWith(' ')) active = false;
    }
  } else if (name === 'go.mod') {
    content.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*(?:module\s+)?([a-z0-9_.-]+\.[a-z]{2,}\/\S+)/i);
      if (match) add(tokens, match[1]);
    });
  } else if (name === 'dockerfile') {
    [...content.matchAll(/^\s*FROM\s+([^\s]+)/gim)].forEach((match) => add(tokens, match[1].split('@')[0]));
  } else if (/\.ya?ml$/.test(name) && logicalPath.toLowerCase().includes('.github/workflows/')) {
    [...content.matchAll(/\buses:\s*([a-z0-9_.-]+\/[a-z0-9_.-]+)(?:@[\w.-]+)?/gi)].forEach((match) => add(tokens, match[1]));
  }
  return tokens;
};

const parseImportTokens = (filePath, text) => {
  const tokens = new Set();
  const ext = path.posix.extname(normalizePath(filePath)).toLowerCase();
  const content = cleanPatch(text);
  let values = [];
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) values = [...content.matchAll(/(?:\bfrom\s*|\brequire\s*\(|\bimport\s*\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
  else if (ext === '.py') values = [...content.matchAll(/^\s*(?:from|import)\s+([a-zA-Z_][\w.]*)/gm)].map((m) => m[1]);
  else if (['.java', '.kt', '.kts', '.scala'].includes(ext)) values = [...content.matchAll(/^\s*import\s+([a-zA-Z_][\w.]*)/gm)].map((m) => m[1].split('.').slice(0, 3).join('.'));
  else if (ext === '.dart') values = [...content.matchAll(/\bimport\s+["']package:([^/"']+)/gi)].map((m) => m[1]);
  else if (ext === '.cs') values = [...content.matchAll(/^\s*using\s+([a-zA-Z_][\w.]*)\s*;/gm)].map((m) => m[1]);
  else if (ext === '.rs') values = [...content.matchAll(/^\s*use\s+([a-zA-Z_][\w]*)/gm)].map((m) => m[1]).filter((v) => !['crate', 'self', 'super', 'std'].includes(v));
  else if (ext === '.rb') values = [...content.matchAll(/^\s*require\s*["']([^"']+)/gm)].map((m) => m[1]);
  else if (ext === '.go') values = [...content.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  values.forEach((value) => add(tokens, value));
  return tokens;
};

const buildApiEvidence = (files = [], options = {}) => {
  const minFrequency = Math.max(1, Number(options.minImportFrequency || MIN_IMPORT_FREQUENCY));
  const strong = new Set();
  const frequency = new Map();
  const orderedFiles = [...files].sort((a, b) => normalizePath(a.path).localeCompare(normalizePath(b.path)));
  for (const file of orderedFiles) {
    const content = String(file.evidenceContent || file.content || file.patch || '');
    parseDependencyTokens(file.path, content).forEach((token) => strong.add(token));
    parseImportTokens(file.path, content).forEach((token) => frequency.set(token, (frequency.get(token) || 0) + 1));
  }
  const repeated = [...frequency].filter(([, count]) => count >= minFrequency).map(([token]) => token);
  return {
    apiTokens: [...new Set([...strong, ...repeated])].sort(),
    diagnostics: {
      apiEvidenceVersion: API_EVIDENCE_VERSION,
      rawDependencyTokenCount: strong.size,
      retainedDependencyTokenCount: strong.size,
      rawImportTokenCount: frequency.size,
      retainedImportTokenCount: repeated.length,
      minImportFrequency: minFrequency,
    },
  };
};

module.exports = { API_EVIDENCE_VERSION, MIN_IMPORT_FREQUENCY, normalizeToken, parseDependencyTokens, parseImportTokens, buildApiEvidence };
