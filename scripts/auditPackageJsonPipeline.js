const assert = require('assert');

const { parsePackageJson } = require('../src/services/github/github.parser.service');
const {
  buildDev2VecInputFromRepositoryAnalysis,
} = require('../src/services/dev2vec/dev2vecInputBuilder.service');

const fixturePackageJson = {
  dependencies: {
    react: '^18.0.0',
    'react-dom': '^18.0.0',
    'react-router-dom': '^6.0.0',
  },
  devDependencies: {
    vite: '^5.0.0',
    tailwindcss: '^3.0.0',
    vitest: '^1.0.0',
  },
};

const peerOptionalFixturePackageJson = {
  dependencies: {},
  devDependencies: {},
  peerDependencies: {
    '@audit/peer-only': '^1.0.0',
  },
  optionalDependencies: {
    '@audit/optional-only': '^1.0.0',
  },
};

const packageContent = JSON.stringify(fixturePackageJson, null, 2);
const parsed = parsePackageJson(packageContent);

const packageRecord = {
  packageFiles: ['package.json'],
  packages: parsed.packages,
  frameworks: parsed.frameworks,
  configs: [],
  detectedFiles: [{
    fileName: 'package.json',
    path: 'package.json',
    type: 'node',
    contentPreview: packageContent.slice(0, 200),
    sourceContent: packageContent,
    parsedData: parsed.parsed,
    detectedPackages: parsed.packages,
    detectedScripts: parsed.scripts,
    detectedFrameworks: parsed.frameworks,
  }],
};

const input = buildDev2VecInputFromRepositoryAnalysis({
  requestId: 'audit-package-json-pipeline',
  repository: {
    name: 'frontend-package-fixture',
    fullName: 'audit/frontend-package-fixture',
    description: 'Fixture for auditing package.json evidence flow',
    language: 'JavaScript',
  },
  packages: [packageRecord],
  commits: [],
  issues: [],
});

const expectedPackages = [
  'react',
  'react-dom',
  'react-router-dom',
  'vite',
  'tailwindcss',
  'vitest',
];

const containsAll = (textOrArray) => Object.fromEntries(expectedPackages.map((pkg) => [
  pkg,
  Array.isArray(textOrArray)
    ? textOrArray.includes(pkg)
    : String(textOrArray || '').toLowerCase().includes(pkg),
]));

const peerOptionalParsed = parsePackageJson(JSON.stringify(peerOptionalFixturePackageJson));
const peerOptionalContent = JSON.stringify(peerOptionalFixturePackageJson, null, 2);
const peerOptionalInput = buildDev2VecInputFromRepositoryAnalysis({
  requestId: 'audit-peer-optional-package-json-pipeline',
  repository: {
    name: 'peer-optional-fixture',
    fullName: 'audit/peer-optional-fixture',
    description: 'Fixture for auditing peer and optional package flow',
    language: 'JavaScript',
  },
  packages: [{
    packageFiles: ['package.json'],
    packages: peerOptionalParsed.packages,
    frameworks: peerOptionalParsed.frameworks,
    configs: [],
    detectedFiles: [{
      fileName: 'package.json',
      path: 'package.json',
      type: 'node',
      contentPreview: peerOptionalContent.slice(0, 200),
      sourceContent: peerOptionalContent,
      parsedData: peerOptionalParsed.parsed,
      detectedPackages: peerOptionalParsed.packages,
      detectedScripts: peerOptionalParsed.scripts,
      detectedFrameworks: peerOptionalParsed.frameworks,
    }],
  }],
  commits: [],
  issues: [],
});
const roleHints = [...new Set(input.evidencePreview.sourceFiles.flatMap((file) => file.roleHints || []))];
const evidenceCategories = [...new Set(input.evidencePreview.sourceFiles.map((file) => file.category))];

const output = {
  parsedDependencies: Object.keys(parsed.parsed.dependencies || {}),
  parsedDevDependencies: Object.keys(parsed.parsed.devDependencies || {}),
  parsedPeerDependenciesFromParserPackages: peerOptionalParsed.packages.includes('@audit/peer-only'),
  parsedOptionalDependenciesFromParserPackages: peerOptionalParsed.packages.includes('@audit/optional-only'),
  peerOptionalModelInputContains: {
    repoDocumentPeerOnly: input.repoDocument.includes('@audit/peer-only'),
    repoDocumentOptionalOnly: input.repoDocument.includes('@audit/optional-only'),
    peerFixtureRepoDocumentPeerOnly: peerOptionalInput.repoDocument.includes('@audit/peer-only'),
    peerFixtureRepoDocumentOptionalOnly: peerOptionalInput.repoDocument.includes('@audit/optional-only'),
    peerFixtureApiTokensPeerOnly: peerOptionalInput.apiTokens.includes('@audit/peer-only'),
    peerFixtureApiTokensOptionalOnly: peerOptionalInput.apiTokens.includes('@audit/optional-only'),
  },
  detectedPackages: parsed.packages,
  detectedFrameworks: parsed.frameworks,
  projectSignals: {
    frontend: input.sourceStats.frontendFileCount > 0,
    backend: input.sourceStats.backendFileCount > 0,
    mobile: input.sourceStats.mobileFileCount > 0,
    devops: input.sourceStats.devopsFileCount > 0,
    data: input.sourceStats.dataFileCount > 0,
  },
  roleHints,
  evidenceCategories,
  repoDocumentContains: containsAll(input.repoDocument),
  apiTokensContains: containsAll(input.apiTokens),
  apiTokens: input.apiTokens,
  sourceStats: {
    apiTokenCount: input.sourceStats.apiTokenCount,
    sourceFileCount: input.sourceStats.sourceFileCount,
    frontendFileCount: input.sourceStats.frontendFileCount,
    categoryCounts: input.sourceStats.categoryCounts,
  },
};

for (const pkg of expectedPackages) {
  assert(output.parsedDependencies.includes(pkg) || output.parsedDevDependencies.includes(pkg));
  assert(output.detectedPackages.includes(pkg));
  assert(output.repoDocumentContains[pkg]);
  assert(output.apiTokensContains[pkg]);
}

assert(output.detectedFrameworks.includes('React'));
assert(output.detectedFrameworks.includes('Frontend routing'));
assert(output.detectedFrameworks.includes('Vite'));
assert(output.detectedFrameworks.includes('Frontend styling'));
assert(output.detectedFrameworks.includes('Testing'));
assert(output.projectSignals.frontend);
assert(output.roleHints.includes('frontend'));

console.log(JSON.stringify(output, null, 2));
