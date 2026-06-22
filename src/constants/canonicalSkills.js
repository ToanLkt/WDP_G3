/**
 * Shared vocabulary for skill names across analysis, roadmap, learning, and
 * progress modules. Keep canonical names unique and add alternate spellings to
 * aliases instead of creating another skill entry.
 */
const CANONICAL_SKILLS = [
  // Frontend
  { name: 'HTML', category: 'Frontend', aliases: ['HTML5', 'HyperText Markup Language'], defaultLevel: 'beginner', tags: ['html', 'frontend', 'web', 'markup'] },
  { name: 'CSS', category: 'Frontend', aliases: ['CSS3', 'Cascading Style Sheets'], defaultLevel: 'beginner', tags: ['css', 'frontend', 'web', 'styling'] },
  { name: 'JavaScript', category: 'Frontend', aliases: ['JS', 'ECMAScript'], defaultLevel: 'beginner', tags: ['javascript', 'frontend', 'backend', 'web'] },
  { name: 'TypeScript', category: 'Frontend', aliases: ['TS', 'Typed JavaScript'], defaultLevel: 'intermediate', tags: ['typescript', 'javascript', 'frontend', 'typing'] },
  { name: 'React', category: 'Frontend', aliases: ['React.js', 'ReactJS'], defaultLevel: 'intermediate', tags: ['react', 'frontend', 'javascript', 'ui'] },
  { name: 'React Hooks', category: 'Frontend', aliases: ['Hooks', 'React Hook', 'useState/useEffect'], defaultLevel: 'intermediate', tags: ['react', 'hooks', 'frontend', 'state'] },
  { name: 'React Router', category: 'Frontend', aliases: ['react-router', 'react-router-dom', 'Client-side Routing'], defaultLevel: 'intermediate', tags: ['react', 'router', 'frontend', 'routing'] },
  { name: 'Tailwind CSS', category: 'Frontend', aliases: ['Tailwind', 'tailwindcss'], defaultLevel: 'beginner', tags: ['tailwind', 'css', 'frontend', 'styling'] },
  { name: 'Bootstrap', category: 'Frontend', aliases: ['Bootstrap CSS', 'React Bootstrap'], defaultLevel: 'beginner', tags: ['bootstrap', 'css', 'frontend', 'ui'] },
  { name: 'Responsive Design', category: 'Frontend', aliases: ['Responsive Web Design', 'Mobile-first Design', 'RWD'], defaultLevel: 'beginner', tags: ['responsive', 'frontend', 'css', 'mobile'] },
  { name: 'API Integration', category: 'Frontend', aliases: ['API Consumption', 'Consume API', 'Frontend API Integration'], defaultLevel: 'intermediate', tags: ['api', 'frontend', 'integration', 'http'] },
  { name: 'Axios', category: 'Frontend', aliases: ['axios', 'Axios HTTP Client'], defaultLevel: 'beginner', tags: ['axios', 'http', 'api', 'frontend'] },
  { name: 'Form Handling', category: 'Frontend', aliases: ['Forms', 'Form Management', 'React Forms'], defaultLevel: 'intermediate', tags: ['forms', 'frontend', 'validation', 'ui'] },
  { name: 'State Management', category: 'Frontend', aliases: ['Application State', 'Global State', 'Redux', 'Context API'], defaultLevel: 'intermediate', tags: ['state', 'frontend', 'react', 'redux'] },
  { name: 'Vite', category: 'Tooling', aliases: ['vite', 'Vite.js'], defaultLevel: 'beginner', tags: ['vite', 'tooling', 'frontend', 'build'] },

  // Backend
  { name: 'Node.js', category: 'Backend', aliases: ['Node', 'NodeJS', 'Node JS'], defaultLevel: 'beginner', tags: ['nodejs', 'javascript', 'backend', 'runtime'] },
  { name: 'Express.js', category: 'Backend', aliases: ['Express', 'ExpressJS', 'Express JS'], defaultLevel: 'beginner', tags: ['express', 'nodejs', 'backend', 'api'] },
  { name: 'REST API', category: 'Backend', aliases: ['REST', 'RESTful API', 'API Design', 'Backend API', 'HTTP API'], defaultLevel: 'intermediate', tags: ['rest', 'api', 'backend', 'http'] },
  { name: 'CRUD', category: 'Backend', aliases: ['Create Read Update Delete', 'CRUD Operations'], defaultLevel: 'beginner', tags: ['crud', 'backend', 'database', 'api'] },
  { name: 'JWT Authentication', category: 'Backend', aliases: ['JWT Auth', 'Authentication with JWT', 'jsonwebtoken', 'JWT'], defaultLevel: 'beginner', tags: ['jwt', 'authentication', 'backend', 'security'] },
  { name: 'Authentication', category: 'Backend', aliases: ['User Authentication', 'Login Authentication', 'Auth'], defaultLevel: 'intermediate', tags: ['authentication', 'backend', 'security', 'identity'] },
  { name: 'Middleware', category: 'Backend', aliases: ['Express Middleware', 'Request Middleware'], defaultLevel: 'intermediate', tags: ['middleware', 'express', 'backend', 'request'] },
  { name: 'Validation', category: 'Backend', aliases: ['Input Validation', 'Request Validation', 'Data Validation'], defaultLevel: 'beginner', tags: ['validation', 'backend', 'security', 'data'] },
  { name: 'Error Handling', category: 'Backend', aliases: ['Exception Handling', 'Error Management', 'Global Error Handler'], defaultLevel: 'intermediate', tags: ['errors', 'backend', 'debugging', 'api'] },
  { name: 'Environment Variables', category: 'Backend', aliases: ['.env', 'dotenv', 'Environment Configuration', 'Env Config'], defaultLevel: 'beginner', tags: ['environment', 'configuration', 'backend', 'security'] },
  { name: 'File Upload', category: 'Backend', aliases: ['File Uploads', 'Multer', 'Upload API'], defaultLevel: 'intermediate', tags: ['upload', 'files', 'backend', 'api'] },
  { name: 'Swagger', category: 'Backend', aliases: ['OpenAPI', 'swagger-jsdoc', 'swagger-ui-express', 'API Documentation'], defaultLevel: 'intermediate', tags: ['swagger', 'openapi', 'backend', 'documentation'] },
  { name: 'API Security', category: 'Backend', aliases: ['Secure API', 'API Protection', 'Web API Security'], defaultLevel: 'advanced', tags: ['api', 'security', 'backend', 'authentication'] },

  // Database
  { name: 'MongoDB', category: 'Database', aliases: ['mongodb', 'Mongo DB', 'NoSQL Database'], defaultLevel: 'beginner', tags: ['mongodb', 'nosql', 'database', 'data'] },
  { name: 'Mongoose', category: 'Database', aliases: ['mongoose', 'MongoDB/Mongoose', 'MongoDB ODM'], defaultLevel: 'intermediate', tags: ['mongoose', 'mongodb', 'odm', 'database'] },
  { name: 'MongoDB CRUD', category: 'Database', aliases: ['Mongo CRUD', 'MongoDB Operations', 'CRUD with MongoDB'], defaultLevel: 'beginner', tags: ['mongodb', 'crud', 'database', 'nosql'] },
  { name: 'MongoDB Aggregation', category: 'Database', aliases: ['Aggregation Pipeline', 'Mongo Aggregation', 'MongoDB Pipeline'], defaultLevel: 'advanced', tags: ['mongodb', 'aggregation', 'database', 'pipeline'] },
  { name: 'SQL', category: 'Database', aliases: ['Structured Query Language', 'SQL Database'], defaultLevel: 'beginner', tags: ['sql', 'database', 'relational', 'query'] },
  { name: 'MySQL', category: 'Database', aliases: ['mysql', 'My SQL'], defaultLevel: 'beginner', tags: ['mysql', 'sql', 'database', 'relational'] },
  { name: 'PostgreSQL', category: 'Database', aliases: ['Postgres', 'Postgre SQL', 'psql'], defaultLevel: 'intermediate', tags: ['postgresql', 'sql', 'database', 'relational'] },
  { name: 'Database Design', category: 'Database', aliases: ['DB Design', 'Schema Design', 'Database Architecture'], defaultLevel: 'intermediate', tags: ['database', 'design', 'schema', 'architecture'] },
  { name: 'Data Modeling', category: 'Database', aliases: ['Data Model', 'Database Modeling', 'Schema Modeling'], defaultLevel: 'intermediate', tags: ['data', 'modeling', 'database', 'schema'] },

  // DevOps
  { name: 'Git', category: 'DevOps', aliases: ['Git Version Control', 'Version Control with Git'], defaultLevel: 'beginner', tags: ['git', 'version-control', 'devops', 'tooling'] },
  { name: 'GitHub', category: 'DevOps', aliases: ['Github', 'GitHub Platform'], defaultLevel: 'beginner', tags: ['github', 'git', 'collaboration', 'devops'] },
  { name: 'Docker', category: 'DevOps', aliases: ['Docker Container', 'Containerization'], defaultLevel: 'intermediate', tags: ['docker', 'container', 'devops', 'deployment'] },
  { name: 'Docker Compose', category: 'DevOps', aliases: ['docker-compose', 'DockerCompose', 'Compose'], defaultLevel: 'intermediate', tags: ['docker', 'compose', 'devops', 'container'] },
  { name: 'Postman', category: 'Tooling', aliases: ['Postman API', 'Postman Collection'], defaultLevel: 'beginner', tags: ['postman', 'api', 'testing', 'tooling'] },
  { name: 'Render Deployment', category: 'DevOps', aliases: ['Render', 'Deploy to Render', 'Render.com'], defaultLevel: 'beginner', tags: ['render', 'deployment', 'devops', 'hosting'] },
  { name: 'Vercel Deployment', category: 'DevOps', aliases: ['Vercel', 'Deploy to Vercel'], defaultLevel: 'beginner', tags: ['vercel', 'deployment', 'devops', 'hosting'] },
  { name: 'CI/CD', category: 'DevOps', aliases: ['CICD', 'CI CD', 'Continuous Integration', 'Continuous Deployment', 'Continuous Integration/Continuous Deployment'], defaultLevel: 'intermediate', tags: ['ci', 'cd', 'automation', 'devops'] },
  { name: 'GitHub Actions', category: 'DevOps', aliases: ['github actions', 'GitHub Workflow', 'GitHub Workflows', '.github/workflows'], defaultLevel: 'intermediate', tags: ['github', 'actions', 'ci-cd', 'automation'] },

  // Testing and code quality
  { name: 'Testing', category: 'Testing', aliases: ['Automated Testing', 'Test', 'Tests', 'test setup'], defaultLevel: 'beginner', tags: ['testing', 'automation', 'quality', 'test'] },
  { name: 'Jest', category: 'Testing', aliases: ['jest', 'Jest Testing'], defaultLevel: 'beginner', tags: ['jest', 'testing', 'javascript', 'unit-test'] },
  { name: 'Unit Testing', category: 'Testing', aliases: ['Unit Tests', 'Unit Test'], defaultLevel: 'intermediate', tags: ['unit', 'testing', 'automation', 'quality'] },
  { name: 'API Testing', category: 'Testing', aliases: ['REST API Testing', 'Endpoint Testing', 'Integration API Testing'], defaultLevel: 'intermediate', tags: ['api', 'testing', 'backend', 'integration'] },
  { name: 'Clean Code', category: 'Code Quality', aliases: ['Code Quality', 'Code Maintainability', 'Maintainable Code'], defaultLevel: 'intermediate', tags: ['clean-code', 'quality', 'maintainability', 'engineering'] },
  { name: 'Debugging', category: 'Code Quality', aliases: ['Debug', 'Troubleshooting', 'Bug Investigation'], defaultLevel: 'beginner', tags: ['debugging', 'bugs', 'quality', 'tooling'] },
  { name: 'Code Review', category: 'Code Quality', aliases: ['Peer Review', 'Pull Request Review', 'PR Review'], defaultLevel: 'intermediate', tags: ['review', 'quality', 'collaboration', 'git'] },
  { name: 'Refactoring', category: 'Code Quality', aliases: ['Code Refactoring', 'Refactor'], defaultLevel: 'intermediate', tags: ['refactoring', 'quality', 'clean-code', 'maintainability'] },
  { name: 'Linting', category: 'Code Quality', aliases: ['ESLint', 'eslint', 'linter'], defaultLevel: 'beginner', tags: ['linting', 'eslint', 'quality', 'tooling'] },
  { name: 'Formatting', category: 'Code Quality', aliases: ['Prettier', 'Code Formatter', 'formatter'], defaultLevel: 'beginner', tags: ['formatting', 'prettier', 'quality', 'tooling'] },

  // Mobile
  { name: 'React Native', category: 'Mobile', aliases: ['ReactNative', 'React Native Development'], defaultLevel: 'intermediate', tags: ['react-native', 'mobile', 'react', 'javascript'] },
  { name: 'Expo', category: 'Mobile', aliases: ['Expo SDK', 'Expo Go'], defaultLevel: 'beginner', tags: ['expo', 'react-native', 'mobile', 'tooling'] },

  // AI
  { name: 'Gemini API', category: 'AI', aliases: ['Gemini', 'Google Gemini', 'Google Generative AI', '@google/generative-ai'], defaultLevel: 'intermediate', tags: ['gemini', 'ai', 'llm', 'api'] },
  { name: 'OpenAI API', category: 'AI', aliases: ['OpenAI', 'GPT API', 'ChatGPT API'], defaultLevel: 'intermediate', tags: ['openai', 'gpt', 'ai', 'api'] },
  { name: 'Prompt Engineering', category: 'AI', aliases: ['Prompt Design', 'LLM Prompting', 'Prompting'], defaultLevel: 'intermediate', tags: ['prompt', 'ai', 'llm', 'engineering'] },
  { name: 'Chatbot', category: 'AI', aliases: ['Chat Bot', 'Conversational AI', 'AI Chatbot'], defaultLevel: 'intermediate', tags: ['chatbot', 'ai', 'conversation', 'llm'] },
  { name: 'LLM API Integration', category: 'AI', aliases: ['LLM Integration', 'AI API Integration', 'Generative AI Integration'], defaultLevel: 'advanced', tags: ['llm', 'ai', 'api', 'integration'] },

  // General
  { name: 'Backend Development', category: 'General', aliases: ['Backend Engineering', 'Server-side Development'], defaultLevel: 'beginner', tags: ['backend', 'development', 'engineering', 'server'] },
  { name: 'Frontend Development', category: 'General', aliases: ['Frontend Engineering', 'Client-side Development'], defaultLevel: 'beginner', tags: ['frontend', 'development', 'engineering', 'web'] },
  { name: 'Fullstack Development', category: 'General', aliases: ['Full Stack Development', 'Full-stack Development', 'Fullstack'], defaultLevel: 'intermediate', tags: ['fullstack', 'frontend', 'backend', 'development'] },
  { name: 'Software Engineering', category: 'General', aliases: ['Software Development', 'Software Engineer'], defaultLevel: 'beginner', tags: ['software', 'engineering', 'development', 'general'] },
];

module.exports = {
  CANONICAL_SKILLS,
};
