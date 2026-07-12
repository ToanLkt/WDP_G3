const { canonicalizeSkillName } = require('../utils/skillCanonicalizer');

const MISSING_PRIORITY = [
  'Testing',
  'CI/CD',
  'GitHub Actions',
  'Clean Code',
  'Linting',
  'Formatting',
  'API Testing',
  'Unit Testing',
  'API Security',
  'Docker',
  'Docker Compose',
  'Environment Variables',
  'Swagger',
];

const STRENGTH_PRIORITY = [
  'Express.js',
  'REST API',
  'JWT Authentication',
  'Authentication',
  'MongoDB',
  'Mongoose',
  'Docker',
  'Docker Compose',
  'Swagger',
  'Environment Variables',
  'Testing',
  'CI/CD',
];

const STRENGTH_MESSAGES = {
  'Express.js': 'Repo thể hiện năng lực xây dựng backend API với Express.js.',
  'REST API': 'Repo có tín hiệu tốt về thiết kế và triển khai REST API.',
  'JWT Authentication': 'Repo có xử lý xác thực bằng JWT, phù hợp với các backend API cần bảo mật.',
  Authentication: 'Repo có xử lý xác thực người dùng và bảo mật cơ bản.',
  MongoDB: 'Repo có sử dụng MongoDB để lưu trữ và quản lý dữ liệu.',
  Mongoose: 'Repo có sử dụng Mongoose để làm việc với MongoDB theo mô hình ODM.',
  Docker: 'Repo có Docker, hỗ trợ đóng gói và chạy ứng dụng ổn định hơn.',
  'Docker Compose': 'Repo có Docker Compose, phù hợp cho môi trường nhiều service.',
  Swagger: 'Repo có Swagger/OpenAPI, giúp tài liệu hóa và kiểm thử API dễ hơn.',
  'Environment Variables': 'Repo có cấu hình biến môi trường, giúp quản lý cấu hình an toàn và linh hoạt hơn.',
  Testing: 'Repo có tín hiệu automated testing, giúp tăng độ tin cậy khi phát triển.',
  'CI/CD': 'Repo có tín hiệu CI/CD, giúp tự động hóa kiểm tra hoặc triển khai.',
};

const WEAKNESS_MESSAGES = {
  Testing: 'Repo chưa có tín hiệu automated testing rõ ràng.',
  'CI/CD': 'Repo chưa có CI/CD workflow để tự động hóa kiểm tra hoặc triển khai.',
  'GitHub Actions': 'Repo chưa có GitHub Actions để tự động hóa quy trình kiểm tra hoặc triển khai.',
  'Clean Code': 'Repo chưa thể hiện rõ tín hiệu về code quality hoặc maintainability.',
  Linting: 'Repo chưa có cấu hình linting như ESLint để kiểm soát lỗi coding style.',
  Formatting: 'Repo chưa có cấu hình formatter như Prettier để thống nhất format code.',
  'API Testing': 'Repo chưa có tín hiệu kiểm thử API rõ ràng cho các endpoint quan trọng.',
  'Unit Testing': 'Repo chưa có tín hiệu unit test rõ ràng cho các phần logic quan trọng.',
  'API Security': 'Repo chưa thể hiện rõ các thực hành bảo mật API nâng cao.',
  Docker: 'Repo chưa có Docker hoặc cấu hình container hóa rõ ràng.',
  'Docker Compose': 'Repo chưa có Docker Compose cho môi trường cần chạy nhiều service.',
  'Environment Variables': 'Repo chưa có hướng dẫn cấu hình biến môi trường rõ ràng.',
  Swagger: 'Repo chưa có Swagger/OpenAPI để tài liệu hóa các endpoint backend.',
};

const RECOMMENDATION_MESSAGES = {
  Testing: 'Nên bổ sung automated testing bằng Jest, Vitest hoặc Supertest để kiểm thử logic và API.',
  'CI/CD': 'Nên thêm GitHub Actions để tự động chạy kiểm tra hoặc deploy sau mỗi lần push.',
  'GitHub Actions': 'Nên cấu hình GitHub Actions để tự động chạy kiểm tra và quy trình triển khai.',
  'Clean Code': 'Nên cải thiện code quality bằng cách tách module rõ ràng, đặt tên nhất quán và giảm lặp code.',
  Linting: 'Nên thêm ESLint để phát hiện lỗi coding style và vấn đề tiềm ẩn trong JavaScript/TypeScript.',
  Formatting: 'Nên thêm Prettier để thống nhất định dạng code trong toàn bộ repo.',
  'API Testing': 'Nên bổ sung API test bằng Supertest hoặc Postman collection để kiểm tra các endpoint quan trọng.',
  'Unit Testing': 'Nên bổ sung unit test cho các service và hàm xử lý logic quan trọng.',
  'API Security': 'Nên bổ sung các thực hành bảo mật API như validate input, rate limiting và xử lý lỗi an toàn.',
  Swagger: 'Nên thêm Swagger/OpenAPI để tài liệu hóa các endpoint backend.',
  Docker: 'Nên thêm Dockerfile để người khác có thể chạy project nhất quán trên nhiều môi trường.',
  'Docker Compose': 'Nên thêm docker-compose.yml nếu project cần chạy nhiều service như backend và database.',
  'Environment Variables': 'Nên thêm .env.example để hướng dẫn cấu hình biến môi trường cần thiết.',
};

const GENERAL_SKILLS = new Set([
  'Software Engineering',
  'Backend Development',
  'Frontend Development',
  'Fullstack Development',
]);

const toVector = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []);

const uniqueStrings = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const getSkillName = (item) => {
  const original = item.canonicalSkillName || item.skill || '';
  if (String(original).trim().toLowerCase() === 'code quality') return 'Clean Code';
  return canonicalizeSkillName(original);
};

const getScore = (item) => {
  const score = Number(item.score) || 0;
  return Math.min(1, Math.max(0, score > 1 ? score / 100 : score));
};
const isStrong = (item) => item.level === 'strong' || getScore(item) >= 0.7;
const isWeak = (item) => item.level === 'weak' || (getScore(item) > 0 && getScore(item) < 0.4);
const isMissing = (item) => item.level === 'missing' || getScore(item) === 0;

const sortByPriority = (items, priority) =>
  [...items].sort((left, right) => {
    const leftName = getSkillName(left);
    const rightName = getSkillName(right);
    const leftIndex = priority.indexOf(leftName);
    const rightIndex = priority.indexOf(rightName);
    const leftRank = leftIndex === -1 ? priority.length : leftIndex;
    const rightRank = rightIndex === -1 ? priority.length : rightIndex;
    return leftRank - rightRank || getScore(right) - getScore(left);
  });

const generateMissingSkillsFromSkillVector = (skillVector) => {
  const missing = sortByPriority(toVector(skillVector).filter(isMissing), MISSING_PRIORITY)
    .map(getSkillName)
    .filter((skill) => skill && !GENERAL_SKILLS.has(skill));

  return uniqueStrings(missing);
};

const generateStrengthsFromSkillVector = (skillVector, context = {}) => {
  const strengths = sortByPriority(toVector(skillVector).filter(isStrong), STRENGTH_PRIORITY)
    .map((item) => {
      const skill = getSkillName(item);
      return STRENGTH_MESSAGES[skill] || `Repo thể hiện năng lực tốt về ${skill}.`;
    });

  const safeContext = context && typeof context === 'object' ? context : {};
  const commitSummary = safeContext.commitSummary || {};
  const checklist = safeContext.checklist || {};

  if (Number(commitSummary.totalCommits) > 10 && Number(commitSummary.activeDays) >= 3) {
    strengths.push('Commit được thực hiện qua nhiều ngày, thể hiện quá trình phát triển liên tục.');
  }
  if (checklist.hasReadme === true) {
    strengths.push('Repo có README, giúp người khác hiểu mục tiêu và cách sử dụng project.');
  }
  if (
    checklist.hasEnvExample === true &&
    !toVector(skillVector).some((item) => getSkillName(item) === 'Environment Variables' && isStrong(item))
  ) {
    strengths.push('Repo có .env.example, giúp người khác cấu hình môi trường dễ hơn.');
  }

  return uniqueStrings(strengths).slice(0, 10);
};

const generateWeaknessesFromSkillVector = (skillVector, context = {}) => {
  const vector = toVector(skillVector);
  const weaknesses = sortByPriority(
    vector.filter((item) => isMissing(item) || isWeak(item)),
    MISSING_PRIORITY
  ).map((item) => {
    const skill = getSkillName(item);
    return WEAKNESS_MESSAGES[skill] || `Repo chưa thể hiện rõ năng lực về ${skill}.`;
  });

  const safeContext = context && typeof context === 'object' ? context : {};
  const checklist = safeContext.checklist || {};
  const scores = safeContext.scores || {};

  if (Number(scores.testingScore) === 0 || checklist.hasTesting === false) {
    weaknesses.unshift(WEAKNESS_MESSAGES.Testing);
  }
  if (checklist.hasCICD === false) {
    weaknesses.push(WEAKNESS_MESSAGES['CI/CD']);
  }

  return uniqueStrings(weaknesses).slice(0, 8);
};

const generateRecommendationsFromSkillVector = (skillVector) => {
  const recommendations = sortByPriority(
    toVector(skillVector).filter((item) => isMissing(item) || isWeak(item)),
    MISSING_PRIORITY
  ).map((item) => {
    const skill = getSkillName(item);
    return RECOMMENDATION_MESSAGES[skill] || `Nên xây dựng kế hoạch thực hành và bổ sung kỹ năng ${skill}.`;
  });

  return uniqueStrings(recommendations).slice(0, 8);
};

const generateAnalysisInsightsFromSkillVector = (skillVector, context = {}) => ({
  strengths: generateStrengthsFromSkillVector(skillVector, context),
  weaknesses: generateWeaknessesFromSkillVector(skillVector, context),
  missingSkills: generateMissingSkillsFromSkillVector(skillVector, context),
  recommendations: generateRecommendationsFromSkillVector(skillVector, context),
});

module.exports = {
  generateAnalysisInsightsFromSkillVector,
  generateStrengthsFromSkillVector,
  generateWeaknessesFromSkillVector,
  generateMissingSkillsFromSkillVector,
  generateRecommendationsFromSkillVector,
};
