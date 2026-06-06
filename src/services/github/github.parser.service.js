const detectFrameworksFromPackage = (pkgJson) => {
  const frameworks = new Set();
  const dependencies = Object.assign({}, pkgJson.dependencies || {}, pkgJson.devDependencies || {});

  const checkPackageName = (name) => {
    if (/express/.test(name)) frameworks.add('Express.js');
    if (/mongoose/.test(name)) frameworks.add('MongoDB/Mongoose');
    if (/react(-dom)?/.test(name)) frameworks.add('React');
    if (/react-native|expo/.test(name)) frameworks.add('React Native/Expo');
    if (/next/.test(name)) frameworks.add('Next.js');
    if (/vue/.test(name)) frameworks.add('Vue');
    if (/angular/.test(name)) frameworks.add('Angular');
    if (/nestjs|@nestjs\//.test(name)) frameworks.add('NestJS');
    if (/prisma/.test(name)) frameworks.add('Prisma');
    if (/sequelize/.test(name)) frameworks.add('Sequelize');
    if (/jsonwebtoken/.test(name)) frameworks.add('JWT Auth');
    if (/bcrypt|bcryptjs/.test(name)) frameworks.add('Password hashing');
    if (/jest|vitest|mocha/.test(name)) frameworks.add('Testing');
    if (/eslint|prettier/.test(name)) frameworks.add('Code quality');
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
