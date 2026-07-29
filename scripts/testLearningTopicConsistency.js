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
console.log('PASS: learning topic profile, grounding validator, and YouTube gate');
