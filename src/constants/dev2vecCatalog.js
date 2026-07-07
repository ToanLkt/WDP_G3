const DEV2VEC_MODEL_VERSION = 'dev2vec-demo-v1';
const DEV2VEC_SCORING_METHOD = 'dev2vec_doc2vec_classifier';

const DEV2VEC_ROLES = [
  {
    roleId: 'backend',
    roleName: 'Backend Developer',
    modelRoleLabel: 'Backend',
    description: 'Build backend services, REST APIs, database logic, authentication, testing, and container-ready delivery.',
    category: 'Software Development',
    level: 'entry',
    skills: ['REST API', 'Database', 'Authentication', 'Docker Basics', 'API Testing'],
  },
  {
    roleId: 'frontend',
    roleName: 'Frontend Developer',
    modelRoleLabel: 'Frontend',
    description: 'Build web user interfaces, component systems, state flows, frontend tests, and responsive layouts.',
    category: 'Software Development',
    level: 'entry',
    skills: ['React UI', 'Component Design', 'State Management', 'Frontend Testing', 'Responsive Design'],
  },
  {
    roleId: 'mobile',
    roleName: 'Mobile Developer',
    modelRoleLabel: 'Mobile',
    description: 'Build mobile screens, navigation flows, offline/local storage, API integration, and app state handling.',
    category: 'Software Development',
    level: 'entry',
    skills: ['Mobile UI', 'Navigation', 'Local Storage', 'API Integration', 'App State Management'],
  },
  {
    roleId: 'devops',
    roleName: 'DevOps Engineer',
    modelRoleLabel: 'DevOps',
    description: 'Automate containerization, orchestration, CI/CD, infrastructure configuration, and monitoring.',
    category: 'Infrastructure & Operations',
    level: 'entry',
    skills: ['Docker', 'Kubernetes', 'CI/CD', 'Infrastructure as Code', 'Monitoring'],
  },
  {
    roleId: 'data_scientist',
    roleName: 'Data Scientist',
    modelRoleLabel: 'Data Scientist',
    description: 'Analyze data, train machine learning models, visualize results, and apply NLP fundamentals.',
    category: 'Data & AI',
    level: 'entry',
    skills: ['Data Analysis', 'Machine Learning', 'Model Training', 'Data Visualization', 'NLP Basics'],
  },
];

const DEV2VEC_SKILLS = [
  { name: 'REST API', category: 'backend', aliases: ['REST', 'RESTful API', 'API', 'Endpoint', 'Route', 'Controller', 'Swagger', 'OpenAPI', 'Express.js', 'Express', 'Node.js'], defaultLevel: 'intermediate', tags: ['backend', 'api', 'rest', 'dev2vec'] },
  { name: 'Database', category: 'backend', aliases: ['MongoDB', 'Mongoose', 'SQL', 'MySQL', 'PostgreSQL', 'Database Design', 'Schema Design', 'Data Modeling', 'Query', 'Index'], defaultLevel: 'intermediate', tags: ['backend', 'database', 'dev2vec'] },
  { name: 'Authentication', category: 'backend', aliases: ['Auth', 'JWT', 'JWT Authentication', 'RBAC', 'Login', 'Refresh Token', 'Authorization', 'Permission'], defaultLevel: 'intermediate', tags: ['backend', 'auth', 'security', 'dev2vec'] },
  { name: 'Docker Basics', category: 'backend', aliases: ['Dockerfile', 'Docker Compose', 'Container', 'Containerization', 'Docker Basics'], defaultLevel: 'beginner', tags: ['backend', 'docker', 'container', 'dev2vec'] },
  { name: 'API Testing', category: 'backend', aliases: ['Testing', 'Jest', 'Supertest', 'Integration Testing', 'Unit Testing', 'Endpoint Testing', 'REST API Testing'], defaultLevel: 'intermediate', tags: ['backend', 'testing', 'api', 'dev2vec'] },

  { name: 'React UI', category: 'frontend', aliases: ['React', 'React.js', 'ReactJS', 'JSX', 'Frontend UI'], defaultLevel: 'intermediate', tags: ['frontend', 'react', 'ui', 'dev2vec'] },
  { name: 'Component Design', category: 'frontend', aliases: ['Components', 'React Components', 'UI Component', 'Component Architecture'], defaultLevel: 'intermediate', tags: ['frontend', 'components', 'dev2vec'] },
  { name: 'State Management', category: 'frontend', aliases: ['Application State', 'Global State', 'Redux', 'Context API', 'Store'], defaultLevel: 'intermediate', tags: ['frontend', 'state', 'dev2vec'] },
  { name: 'Frontend Testing', category: 'frontend', aliases: ['React Testing', 'Component Testing', 'UI Testing', 'Frontend Unit Testing'], defaultLevel: 'intermediate', tags: ['frontend', 'testing', 'dev2vec'] },
  { name: 'Responsive Design', category: 'frontend', aliases: ['Responsive Web Design', 'Mobile-first Design', 'RWD', 'Breakpoint', 'CSS Grid', 'Flexbox'], defaultLevel: 'beginner', tags: ['frontend', 'responsive', 'css', 'dev2vec'] },

  { name: 'Mobile UI', category: 'mobile', aliases: ['Mobile Screen', 'Mobile Layout', 'React Native UI', 'Widget'], defaultLevel: 'intermediate', tags: ['mobile', 'ui', 'dev2vec'] },
  { name: 'Navigation', category: 'mobile', aliases: ['Mobile Navigation', 'React Navigation', 'Stack Navigation', 'Tab Navigation', 'Deep Link'], defaultLevel: 'intermediate', tags: ['mobile', 'navigation', 'dev2vec'] },
  { name: 'Local Storage', category: 'mobile', aliases: ['AsyncStorage', 'Offline Storage', 'Mobile Cache', 'Preferences'], defaultLevel: 'beginner', tags: ['mobile', 'storage', 'offline', 'dev2vec'] },
  { name: 'API Integration', category: 'mobile', aliases: ['Mobile API Integration', 'API Client', 'Network Request', 'Axios', 'Fetch API'], defaultLevel: 'intermediate', tags: ['mobile', 'api', 'integration', 'dev2vec'] },
  { name: 'App State Management', category: 'mobile', aliases: ['Mobile State Management', 'App State', 'Lifecycle State', 'Reactive State'], defaultLevel: 'intermediate', tags: ['mobile', 'state', 'dev2vec'] },

  { name: 'Docker', category: 'devops', aliases: ['Docker Container', 'Containerization', 'Docker Image'], defaultLevel: 'intermediate', tags: ['devops', 'docker', 'dev2vec'] },
  { name: 'Kubernetes', category: 'devops', aliases: ['K8s', 'Kube', 'Cluster', 'Pod', 'Deployment'], defaultLevel: 'intermediate', tags: ['devops', 'kubernetes', 'dev2vec'] },
  { name: 'CI/CD', category: 'devops', aliases: ['CICD', 'CI CD', 'Continuous Integration', 'Continuous Deployment', 'GitHub Actions', 'GitHub Workflow', '.github/workflows'], defaultLevel: 'intermediate', tags: ['devops', 'automation', 'dev2vec'] },
  { name: 'Infrastructure as Code', category: 'devops', aliases: ['IaC', 'Terraform', 'Ansible', 'Infrastructure Code'], defaultLevel: 'intermediate', tags: ['devops', 'iac', 'dev2vec'] },
  { name: 'Monitoring', category: 'devops', aliases: ['Observability', 'Metrics', 'Logging', 'Alerting', 'Prometheus', 'Grafana'], defaultLevel: 'intermediate', tags: ['devops', 'monitoring', 'dev2vec'] },

  { name: 'Data Analysis', category: 'data_scientist', aliases: ['EDA', 'Exploratory Data Analysis', 'Pandas', 'NumPy', 'Data Cleaning'], defaultLevel: 'beginner', tags: ['data', 'analysis', 'dev2vec'] },
  { name: 'Machine Learning', category: 'data_scientist', aliases: ['ML', 'Scikit-learn', 'Supervised Learning', 'Unsupervised Learning'], defaultLevel: 'intermediate', tags: ['data', 'machine-learning', 'dev2vec'] },
  { name: 'Model Training', category: 'data_scientist', aliases: ['Training Pipeline', 'Model Evaluation', 'Feature Engineering', 'Hyperparameter Tuning'], defaultLevel: 'intermediate', tags: ['data', 'model-training', 'dev2vec'] },
  { name: 'Data Visualization', category: 'data_scientist', aliases: ['Visualization', 'Matplotlib', 'Seaborn', 'Charts', 'Dashboard'], defaultLevel: 'beginner', tags: ['data', 'visualization', 'dev2vec'] },
  { name: 'NLP Basics', category: 'data_scientist', aliases: ['NLP', 'Text Processing', 'Tokenization', 'Text Classification'], defaultLevel: 'beginner', tags: ['data', 'nlp', 'dev2vec'] },
];

const ROLE_ID_ALIASES = {
  'backend-developer': 'backend',
  'frontend-developer': 'frontend',
  'mobile-developer': 'mobile',
  'devops-engineer': 'devops',
  'data-scientist': 'data_scientist',
  'ai-engineer': 'data_scientist',
  'fullstack-developer': 'backend',
};

module.exports = {
  DEV2VEC_MODEL_VERSION,
  DEV2VEC_SCORING_METHOD,
  DEV2VEC_ROLES,
  DEV2VEC_SKILLS,
  ROLE_ID_ALIASES,
};
