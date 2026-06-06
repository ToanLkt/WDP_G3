// src/services/analysis/analysis.rules.js

const ANALYSIS_RULES = {
  packageAliases: {
    bcrypt: "bcryptjs",
    scikit_learn: "scikit-learn",
    sklearn: "scikit-learn",
    spring_boot: "spring-boot",
    github_actions: "github-actions",
    torch: "pytorch",
  },
  packageSkillMap: {
    // =========================
    // Backend - Node.js
    // =========================
    express: {
      skills: ["Express.js", "REST API", "Backend Development"],
      careerSignals: ["Backend Developer", "Full-stack Developer"],
      strength: "Repo có sử dụng Express.js để xây dựng backend API.",
    },
    mongoose: {
      skills: ["MongoDB", "Mongoose", "Database Integration"],
      careerSignals: ["Backend Developer", "Full-stack Developer"],
      strength: "Repo có tích hợp MongoDB/Mongoose để làm việc với database.",
    },
    jsonwebtoken: {
      skills: ["JWT Authentication", "Authentication", "Security Basics"],
      careerSignals: ["Backend Developer", "Full-stack Developer"],
      strength: "Repo có xử lý xác thực bằng JWT.",
    },
    bcrypt: {
      skills: ["Password Hashing", "Authentication Security"],
      careerSignals: ["Backend Developer"],
      strength: "Repo có mã hóa mật khẩu, thể hiện hiểu biết cơ bản về bảo mật.",
    },
    bcryptjs: {
      skills: ["Password Hashing", "Authentication Security"],
      careerSignals: ["Backend Developer"],
      strength: "Repo có mã hóa mật khẩu, thể hiện hiểu biết cơ bản về bảo mật.",
    },
    cors: {
      skills: ["API Integration", "CORS Configuration"],
      careerSignals: ["Backend Developer", "Full-stack Developer"],
    },
    dotenv: {
      skills: ["Environment Configuration"],
      careerSignals: ["Backend Developer", "DevOps Engineer"],
    },
    axios: {
      skills: ["External API Integration", "HTTP Client"],
      careerSignals: ["Backend Developer", "Full-stack Developer"],
    },
    prisma: {
      skills: ["ORM", "Database Modeling", "Prisma"],
      careerSignals: ["Backend Developer"],
    },
    sequelize: {
      skills: ["ORM", "SQL Database", "Sequelize"],
      careerSignals: ["Backend Developer"],
    },
    "@nestjs/core": {
      skills: ["NestJS", "Backend Architecture", "Modular Backend"],
      careerSignals: ["Backend Developer"],
    },

    // =========================
    // Frontend
    // =========================
    react: {
      skills: ["React", "Frontend Development", "Component-based UI"],
      careerSignals: ["Frontend Developer", "Full-stack Developer"],
      strength: "Repo có sử dụng React để xây dựng giao diện người dùng.",
    },
    "react-dom": {
      skills: ["React", "Web UI"],
      careerSignals: ["Frontend Developer"],
    },
    next: {
      skills: ["Next.js", "SSR", "Full-stack Web"],
      careerSignals: ["Frontend Developer", "Full-stack Developer"],
    },
    vue: {
      skills: ["Vue.js", "Frontend Development"],
      careerSignals: ["Frontend Developer"],
    },
    angular: {
      skills: ["Angular", "Frontend Development"],
      careerSignals: ["Frontend Developer"],
    },
    tailwindcss: {
      skills: ["Tailwind CSS", "Responsive UI", "UI Styling"],
      careerSignals: ["Frontend Developer"],
      strength: "Repo có sử dụng Tailwind CSS để xây dựng giao diện hiện đại.",
    },
    "bootstrap": {
      skills: ["Bootstrap", "Responsive UI"],
      careerSignals: ["Frontend Developer"],
    },
    "material-ui": {
      skills: ["Material UI", "UI Component Library"],
      careerSignals: ["Frontend Developer"],
    },
    "@mui/material": {
      skills: ["Material UI", "UI Component Library"],
      careerSignals: ["Frontend Developer"],
    },

    // =========================
    // Mobile
    // =========================
    "react-native": {
      skills: ["React Native", "Mobile Development"],
      careerSignals: ["Mobile Developer"],
      strength: "Repo có sử dụng React Native để phát triển ứng dụng mobile.",
    },
    expo: {
      skills: ["Expo", "React Native", "Mobile Development"],
      careerSignals: ["Mobile Developer"],
      strength: "Repo có sử dụng Expo, phù hợp với hướng phát triển mobile app.",
    },
    flutter: {
      skills: ["Flutter", "Dart", "Mobile Development"],
      careerSignals: ["Mobile Developer"],
    },

    // =========================
    // Testing
    // =========================
    jest: {
      skills: ["Unit Testing", "Jest", "Testing"],
      careerSignals: ["Backend Developer", "Frontend Developer", "QA Engineer"],
      strength: "Repo có sử dụng testing framework, thể hiện ý thức kiểm thử phần mềm.",
    },
    vitest: {
      skills: ["Unit Testing", "Vitest", "Testing"],
      careerSignals: ["Frontend Developer", "QA Engineer"],
      strength: "Repo có sử dụng testing framework.",
    },
    mocha: {
      skills: ["Unit Testing", "Mocha", "Testing"],
      careerSignals: ["Backend Developer", "QA Engineer"],
    },
    cypress: {
      skills: ["E2E Testing", "Cypress", "QA Automation"],
      careerSignals: ["QA Engineer", "Frontend Developer"],
    },
    playwright: {
      skills: ["E2E Testing", "Playwright", "QA Automation"],
      careerSignals: ["QA Engineer"],
    },

    // =========================
    // Code Quality
    // =========================
    eslint: {
      skills: ["Code Quality", "Linting", "Clean Code"],
      careerSignals: ["Software Engineer"],
      strength: "Repo có dùng ESLint để kiểm soát chất lượng code.",
    },
    prettier: {
      skills: ["Code Formatting", "Clean Code"],
      careerSignals: ["Software Engineer"],
      strength: "Repo có dùng Prettier để đồng bộ format code.",
    },
    husky: {
      skills: ["Git Hooks", "Code Quality Automation"],
      careerSignals: ["Software Engineer"],
    },
    "lint-staged": {
      skills: ["Pre-commit Check", "Code Quality Automation"],
      careerSignals: ["Software Engineer"],
    },

    // =========================
    // Data / AI
    // =========================
    pandas: {
      skills: ["Data Analysis", "Pandas", "Python"],
      careerSignals: ["Data Engineer", "AI Engineer"],
    },
    numpy: {
      skills: ["Numerical Computing", "Python", "Data Processing"],
      careerSignals: ["Data Engineer", "AI Engineer"],
    },
    "scikit-learn": {
      skills: ["Machine Learning", "Scikit-learn"],
      careerSignals: ["AI Engineer", "Data Scientist"],
    },
    sklearn: {
      skills: ["Machine Learning", "Scikit-learn"],
      careerSignals: ["AI Engineer", "Data Scientist"],
    },
    tensorflow: {
      skills: ["Deep Learning", "TensorFlow"],
      careerSignals: ["AI Engineer"],
    },
    pytorch: {
      skills: ["Deep Learning", "PyTorch"],
      careerSignals: ["AI Engineer"],
    },
    fastapi: {
      skills: ["FastAPI", "Python Backend", "REST API"],
      careerSignals: ["Backend Developer", "AI Engineer"],
    },
    flask: {
      skills: ["Flask", "Python Backend", "REST API"],
      careerSignals: ["Backend Developer"],
    },
    django: {
      skills: ["Django", "Python Backend", "Web Development"],
      careerSignals: ["Backend Developer"],
    },

    // =========================
    // Java / Enterprise
    // =========================
    "spring-boot": {
      skills: ["Spring Boot", "Java Backend", "Enterprise Backend"],
      careerSignals: ["Backend Developer"],
    },
    junit: {
      skills: ["Java Testing", "JUnit", "Unit Testing"],
      careerSignals: ["Backend Developer", "QA Engineer"],
    },

    // =========================
    // DevOps / Deployment
    // =========================
    docker: {
      skills: ["Docker", "Containerization", "Deployment"],
      careerSignals: ["Backend Developer", "DevOps Engineer"],
      strength: "Repo có Docker, thể hiện khả năng chuẩn bị môi trường triển khai.",
    },
    "docker-compose": {
      skills: ["Docker Compose", "Multi-service Deployment"],
      careerSignals: ["DevOps Engineer", "Backend Developer"],
    },
    "github-actions": {
      skills: ["GitHub Actions", "CI/CD", "Automation"],
      careerSignals: ["DevOps Engineer", "Software Engineer"],
      strength: "Repo có GitHub Actions, thể hiện hiểu biết cơ bản về CI/CD.",
    },
  },

  fileRules: {
    readme: {
      files: ["README.md", "readme.md"],
      skill: "Documentation",
      strength: "Repo có README, giúp người khác hiểu mục tiêu và cách sử dụng project.",
      weakness: "Repo chưa có README hoặc tài liệu mô tả còn thiếu.",
      scoreField: "documentationScore",
    },
    envExample: {
      files: [".env.example"],
      skill: "Environment Configuration",
      strength: "Repo có .env.example, giúp người khác cấu hình môi trường dễ hơn.",
      weakness: "Repo chưa có .env.example, gây khó khăn khi setup project.",
      scoreField: "portfolioReadinessScore",
    },
    docker: {
      files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
      skill: "Docker",
      strength: "Repo có Docker/Docker Compose, hỗ trợ triển khai và chạy project ổn định hơn.",
      weakness: "Repo chưa có Dockerfile hoặc docker-compose cho môi trường triển khai.",
      scoreField: "deploymentScore",
    },
    cicd: {
      files: [".github/workflows"],
      skill: "CI/CD",
      strength: "Repo có GitHub Actions hoặc CI/CD workflow.",
      weakness: "Repo chưa có CI/CD workflow.",
      scoreField: "deploymentScore",
    },
    packageJson: {
      files: ["package.json"],
      skill: "Dependency Management",
      strength: "Repo có package.json, thể hiện quản lý dependency rõ ràng.",
      weakness: "Repo chưa phát hiện file dependency chính.",
      scoreField: "techStackScore",
    },
  },

  projectTypeRules: [
    {
      type: "Backend API",
      anyFrameworks: ["Express.js", "NestJS", "FastAPI", "Flask", "Django", "Spring Boot"],
      skills: ["Backend Development", "REST API"],
    },
    {
      type: "Frontend Web App",
      anyFrameworks: ["React", "Vue.js", "Angular", "Next.js"],
      skills: ["Frontend Development", "Web UI"],
    },
    {
      type: "Mobile App",
      anyFrameworks: ["React Native", "Expo", "Flutter"],
      skills: ["Mobile Development"],
    },
    {
      type: "Data / AI Project",
      anyFrameworks: ["Pandas", "Scikit-learn", "TensorFlow", "PyTorch"],
      skills: ["Data Processing", "Machine Learning"],
    },
    {
      type: "DevOps / Deployment Project",
      anyConfigs: ["Docker", "Docker Compose", "GitHub Actions", "CI/CD"],
      skills: ["Deployment", "Automation"],
    },
  ],

  commitRules: {
    vagueMessages: [
      "update",
      "fix",
      "final",
      "done",
      "test",
      "change",
      "changes",
      "edit",
      "new",
      "commit",
      "upload",
      "first commit",
    ],

    conventionalPrefixes: [
      "feat:",
      "fix:",
      "docs:",
      "style:",
      "refactor:",
      "test:",
      "chore:",
      "build:",
      "ci:",
      "perf:",
    ],

    thresholds: {
      lowCommitCount: 5,
      goodCommitCount: 20,
      highVagueRatio: 0.5,
      goodConventionalRatio: 0.4,
      goodActiveDays: 5,
      oneShotCommitThreshold: 2,
    },

    strengths: {
      goodCommitCount: "Repo có số lượng commit tương đối tốt, thể hiện quá trình phát triển.",
      goodCommitConvention: "Commit message có sử dụng convention tương đối rõ ràng.",
      activeDevelopment: "Commit được thực hiện qua nhiều ngày, thể hiện quá trình phát triển liên tục.",
    },

    weaknesses: {
      lowCommitCount: "Repo có ít commit, chưa thể hiện rõ quá trình phát triển.",
      vagueMessages: "Nhiều commit message còn chung chung như update/fix/final.",
      oneShotUpload: "Repo có dấu hiệu upload một lần, chưa thể hiện quá trình phát triển từng bước.",
      noCommitData: "Chưa có dữ liệu commit để đánh giá quá trình phát triển.",
    },
  },

  scoreWeights: {
    techStackScore: {
      max: 100,
      base: 20,
      perFramework: 10,
      perLanguage: 8,
      perImportantPackage: 4,
    },
    documentationScore: {
      max: 100,
      hasReadme: 60,
      hasEnvExample: 20,
      hasUsefulScripts: 20,
    },
    commitQualityScore: {
      max: 100,
      base: 30,
      goodCommitCount: 25,
      goodConventionalRatio: 25,
      activeDevelopment: 20,
    },
    deploymentScore: {
      max: 100,
      hasDocker: 40,
      hasDockerCompose: 30,
      hasCICD: 30,
    },
    testingScore: {
      max: 100,
      hasUnitTest: 50,
      hasE2ETest: 30,
      hasTestScript: 20,
    },
    portfolioReadinessScore: {
      max: 100,
      hasReadme: 25,
      hasEnvExample: 15,
      hasClearTechStack: 20,
      hasGoodCommitHistory: 20,
      hasDeploymentConfig: 20,
    },
  },

  missingSkillRules: {
    testing: {
      condition: "no_testing_framework",
      missingSkill: "Testing",
      recommendation: "Nên bổ sung unit test hoặc testing framework như Jest, Vitest, JUnit, Cypress hoặc Playwright.",
    },
    docker: {
      condition: "no_docker",
      missingSkill: "Docker",
      recommendation: "Nên thêm Dockerfile hoặc docker-compose để cải thiện khả năng triển khai.",
    },
    readme: {
      condition: "no_readme",
      missingSkill: "Documentation",
      recommendation: "Nên viết README gồm mô tả project, công nghệ sử dụng, cách cài đặt và cách chạy.",
    },
    env: {
      condition: "no_env_example",
      missingSkill: "Environment Configuration",
      recommendation: "Nên thêm .env.example để người khác biết các biến môi trường cần cấu hình.",
    },
    cicd: {
      condition: "no_cicd",
      missingSkill: "CI/CD",
      recommendation: "Nên tìm hiểu GitHub Actions để tự động hóa kiểm tra hoặc deploy.",
    },
    cleanCode: {
      condition: "no_linter_formatter",
      missingSkill: "Code Quality",
      recommendation: "Nên thêm ESLint/Prettier hoặc công cụ kiểm soát chất lượng code.",
    },
  },

  careerDirectionRules: {
    "Backend Developer": {
      requiredSignals: ["Backend Development", "REST API", "Database Integration", "Authentication"],
      bonusSignals: ["Docker", "CI/CD", "Testing", "API Integration"],
    },
    "Frontend Developer": {
      requiredSignals: ["Frontend Development", "Component-based UI", "Responsive UI"],
      bonusSignals: ["Testing", "Code Quality", "UI Component Library"],
    },
    "Full-stack Developer": {
      requiredSignals: ["Backend Development", "Frontend Development", "Database Integration"],
      bonusSignals: ["Authentication", "Deployment", "Testing"],
    },
    "Mobile Developer": {
      requiredSignals: ["Mobile Development"],
      bonusSignals: ["API Integration", "State Management", "Push Notification"],
    },
    "DevOps Engineer": {
      requiredSignals: ["Docker", "CI/CD", "Deployment"],
      bonusSignals: ["Automation", "Environment Configuration"],
    },
    "QA Engineer": {
      requiredSignals: ["Testing"],
      bonusSignals: ["E2E Testing", "QA Automation", "CI/CD"],
    },
    "Data Engineer": {
      requiredSignals: ["Data Processing", "Python", "Database Integration"],
      bonusSignals: ["Pandas", "ETL", "API Integration"],
    },
    "AI Engineer": {
      requiredSignals: ["Machine Learning", "Python"],
      bonusSignals: ["Deep Learning", "Data Processing", "FastAPI"],
    },
  },

  defaultWeaknesses: [
    "Repo cần bổ sung thêm tài liệu, testing hoặc cấu hình triển khai để hoàn thiện hơn.",
  ],

  defaultStrengths: [
    "Repo đã có dữ liệu kỹ thuật đủ để bắt đầu phân tích kỹ năng.",
  ],
};

module.exports = ANALYSIS_RULES;
