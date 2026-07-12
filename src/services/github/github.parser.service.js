const detectFrameworksFromPackage = (pkgJson) => {
  const frameworks = new Set();
  const dependencies = Object.assign({}, pkgJson.dependencies || {}, pkgJson.devDependencies || {});

  const checkPackageName = (name) => {
    const normalized = String(name || '').toLowerCase();
    if (/^(express|fastify|koa|hapi)$/.test(normalized)) frameworks.add('Backend HTTP framework');
    if (/nestjs|@nestjs\//.test(normalized)) frameworks.add('NestJS');
    if (/mongoose|mongodb|sequelize|typeorm|prisma|pg|mysql2?/.test(normalized)) frameworks.add('Database/ORM');
    if (/jsonwebtoken|passport|bcrypt|bcryptjs/.test(normalized)) frameworks.add('Backend authentication');

    if (/^react$|react-dom/.test(normalized)) frameworks.add('React');
    if (/react-router|@remix-run\/router/.test(normalized)) frameworks.add('Frontend routing');
    if (/^next$|nextjs/.test(normalized)) frameworks.add('Next.js');
    if (/^vue$|@vue\//.test(normalized)) frameworks.add('Vue');
    if (/angular|@angular\//.test(normalized)) frameworks.add('Angular');
    if (/^vite$|@vitejs\//.test(normalized)) frameworks.add('Vite');
    if (/svelte/.test(normalized)) frameworks.add('Svelte');
    if (/redux|zustand|pinia/.test(normalized)) frameworks.add('Frontend state management');
    if (/tailwindcss|bootstrap|material-ui|@mui\/|chakra-ui|@chakra-ui\//.test(normalized)) frameworks.add('Frontend styling');

    if (/react-native|expo/.test(normalized)) frameworks.add('React Native/Expo');
    if (/react-navigation|@react-navigation\//.test(normalized)) frameworks.add('Mobile navigation');
    if (/react-native-paper|native-base/.test(normalized)) frameworks.add('Mobile UI library');

    if (/docker|kubernetes|helm|terraform|ansible|serverless|nginx/.test(normalized)) frameworks.add('DevOps tooling');
    if (/prometheus|grafana|opentelemetry/.test(normalized)) frameworks.add('Monitoring');

    if (/numpy|pandas|scipy|scikit-learn|sklearn|tensorflow|keras|torch|pytorch|transformers|xgboost|lightgbm|matplotlib|plotly|jupyter|nltk|spacy|opencv|mlflow/.test(normalized)) frameworks.add('Data/ML tooling');

    if (/jest|vitest|mocha|pytest|cypress|playwright/.test(normalized)) frameworks.add('Testing');
    if (/eslint|prettier|ruff|black/.test(normalized)) frameworks.add('Code quality');
  };

  Object.keys(dependencies).forEach(checkPackageName);

  return Array.from(frameworks);
};

const parsePackageJson = (content) => {
  try {
    const parsed = JSON.parse(content);
    const packages = Object.keys(Object.assign({}, parsed.dependencies || {}, parsed.devDependencies || {}));
    const scripts = Object.keys(parsed.scripts || {});
    const frameworks = detectFrameworksFromPackage(parsed);

    return {
      parsed,
      packages,
      scripts,
      frameworks,
    };
  } catch (error) {
    return {
      parsed: null,
      packages: [],
      scripts: [],
      frameworks: [],
    };
  }
};

const parseRequirementsTxt = (content) =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));

module.exports = {
  detectFrameworksFromPackage,
  parsePackageJson,
  parseRequirementsTxt,
};
