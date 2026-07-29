const assert = require('assert');
const learning = require('../src/services/learning.service');
const { calculateYouTubeVideoScore } = require('../src/services/youtube.service');

const profile = learning.buildLearningTopicProfile({
  skillName: 'REST API',
  targetRole: 'Backend Developer',
  level: 'advanced',
  language: 'vi',
  taskTitle: 'Tích hợp Swagger/OpenAPI để tạo tài liệu API tự động',
  taskDescription: 'Sử dụng swagger-jsdoc và swagger-ui-express để tạo tài liệu endpoint.',
});

assert(/Swagger OpenAPI/i.test(profile.primaryQuery));
assert(profile.tags.includes('swagger-jsdoc'));
assert(profile.requiredTermGroups.length === 2);
assert(calculateYouTubeVideoScore({
  title: 'Deep Dive into REST API Design and Implementation Best Practices',
  description: '',
  channelTitle: 'Trusted learning channel',
  skillName: 'REST API',
  level: 'advanced',
  relevanceTerms: profile.relevanceTerms,
  requiredTermGroups: profile.requiredTermGroups,
  excludedTerms: profile.excludedTerms,
}) < 40);
assert(calculateYouTubeVideoScore({
  title: 'Swagger OpenAPI Documentation with swagger-jsdoc and Express',
  description: 'API documentation tutorial',
  channelTitle: 'Trusted learning channel',
  skillName: 'REST API',
  level: 'advanced',
  relevanceTerms: profile.relevanceTerms,
  requiredTermGroups: profile.requiredTermGroups,
}) >= 40);
assert(learning.validateGroundedLearningContent({
  title: 'Swagger OpenAPI API documentation',
  overview: 'Use swagger-jsdoc and swagger-ui-express with Express.',
}, profile).valid);

const reactProfile = learning.buildLearningTopicProfile({
  skillName: 'React UI',
  targetRole: 'Frontend Developer',
  level: 'beginner',
  taskTitle: 'Khởi tạo ứng dụng React UI từ dự án tĩnh',
  taskDescription: 'Chuyển HTML/CSS sang React UI, khởi tạo router và các trang cơ bản.',
});
assert(/React application setup React Router/i.test(reactProfile.primaryQuery));
assert(!/REST API|Node\.js Express/i.test(reactProfile.primaryQuery));
assert(reactProfile.tags.includes('react router'));
assert(calculateYouTubeVideoScore({
  title: 'React Router Tutorial - Build Pages and Routes',
  description: 'Set up a React application and migrate HTML CSS components.',
  channelTitle: 'Web Dev Simplified',
  skillName: 'React UI',
  level: 'beginner',
  relevanceTerms: reactProfile.relevanceTerms,
  requiredTermGroups: reactProfile.requiredTermGroups,
  excludedTerms: reactProfile.excludedTerms,
}) >= 40);

const componentProfile = learning.buildLearningTopicProfile({
  skillName: 'Component Design',
  targetRole: 'Frontend Developer',
  level: 'intermediate',
  taskTitle: 'Củng cố và tái cấu trúc Component Design',
  taskDescription: 'Phân tách UI thành các Component tái sử dụng và chuẩn hóa dữ liệu qua Props.',
});
assert.strictEqual(learning.hasValidLearningVideo(null, componentProfile), false);
assert.strictEqual(learning.hasValidLearningVideo([], componentProfile), false);
assert(/React reusable components Props/i.test(componentProfile.primaryQuery));
assert(componentProfile.tags.includes('props'));
assert(calculateYouTubeVideoScore({
  title: 'React Reusable Components and Props Tutorial',
  description: 'Refactor components using props and component composition.',
  channelTitle: 'Web Dev Simplified',
  skillName: 'Component Design',
  level: 'intermediate',
  relevanceTerms: componentProfile.relevanceTerms,
  requiredTermGroups: componentProfile.requiredTermGroups,
  excludedTerms: componentProfile.excludedTerms,
}) >= 40);
console.log('PASS: learning topic profile, grounding validator, and YouTube gate');
