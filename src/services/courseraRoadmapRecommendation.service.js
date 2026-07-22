const Roadmap = require('../models/Roadmap');
const CourseraCourse = require('../models/CourseraCourse');
const plan = require('../../data/coursera-roadmap-course-plan.json');
const { createStatusError } = require('./github/github.utils');

const VALID_LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const ROLE_ALIASES = {
  backend: 'backend', 'backend developer': 'backend', 'backend-developer': 'backend',
  frontend: 'frontend', 'frontend developer': 'frontend', 'frontend-developer': 'frontend',
  mobile: 'mobile', 'mobile developer': 'mobile', 'mobile-developer': 'mobile',
  devops: 'devops', 'devops engineer': 'devops', 'devops-engineer': 'devops', 'devops beginner': 'devops',
  data_scientist: 'data_scientist', 'data scientist': 'data_scientist', 'data-scientist': 'data_scientist',
};

const normalizeRoleId = (value) => {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, ' ');
  return ROLE_ALIASES[key] || ROLE_ALIASES[key.replace(/\s+/g, '-')] || '';
};

const normalizeLevel = (value) => {
  const level = String(value || '').trim().toLowerCase();
  return VALID_LEVELS.has(level) ? level : 'beginner';
};

const resolveRoadmapTopic = (roadmap = {}) => {
  const roleId = normalizeRoleId(roadmap.roleId || roadmap.roleMatch?.roleId || roadmap.targetRole);
  const level = normalizeLevel(roadmap.effectiveLevel || roadmap.requestedLevel || roadmap.level);
  return plan.roadmapTopics.find((topic) => topic.roleId === roleId && topic.level === level) || null;
};

const rankCourseForTopic = (course, topic) => {
  const mapping = (course.roadmapTopicMappings || []).find((item) => item.topicId === topic.topicId);
  if (!mapping) return -1;
  let score = Number(mapping.relevanceScore || 0);
  if (course.level === topic.level) score += 8;
  if (course.level === 'mixed') score += 3;
  if (['course', 'specialization'].includes(course.contentType)) score += 4;
  const text = `${course.title || ''} ${course.description || ''}`.toLowerCase();
  score += Math.min(10, (topic.supportingSkills || []).filter((skill) => text.includes(skill.toLowerCase())).length * 2);
  return score;
};

const formatCourse = (course) => ({
  provider: 'coursera',
  title: course.title,
  description: course.description || '',
  url: course.canonicalUrl,
  thumbnailUrl: course.thumbnailUrl || '',
  contentType: course.contentType,
  partnerName: course.partnerName || '',
  level: course.level,
  language: course.language || 'en',
  estimatedDuration: course.estimatedDuration || '',
  pricingType: 'provider_determined',
  linkType: 'direct_course',
  isExternal: true,
});

const getRoadmapCourseRecommendations = async (authUserOrId, roadmapId, options = {}) => {
  const userId = String(typeof authUserOrId === 'string' ? authUserOrId : authUserOrId?.userId || authUserOrId?._id || authUserOrId?.id || '');
  if (!userId) throw createStatusError('Unauthorized', 401);
  const roadmapModel = options.RoadmapModel || Roadmap;
  const courseModel = options.CourseModel || CourseraCourse;
  const roadmap = await roadmapModel.findOne({ _id: roadmapId, userId, isDeleted: { $ne: true } }).lean();
  if (!roadmap) throw createStatusError('Roadmap not found', 404);
  const topic = resolveRoadmapTopic(roadmap);
  const responseTopic = topic ? {
    topicId: topic.topicId, roleId: topic.roleId, level: topic.level, displayName: topic.displayName,
  } : null;
  if (!topic) return { roadmapId: String(roadmap._id || roadmapId), topic: null, courses: [] };

  let courses = [];
  try {
    const rows = await courseModel.find({
      provider: 'coursera', isActive: true, 'roadmapTopicMappings.topicId': topic.topicId,
    }).lean();
    const maxCourses = Math.min(Number(options.limit || topic.maxCourses || 5), topic.maxCourses || 5, 5);
    courses = rows
      .map((course) => ({ course, score: rankCourseForTopic(course, topic) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.course.canonicalUrl.localeCompare(b.course.canonicalUrl))
      .slice(0, maxCourses)
      .map((item) => formatCourse(item.course));
  } catch (error) {
    console.warn('[coursera-roadmap-recommendations]', { reasonCode: 'catalog_query_failed', roadmapId: String(roadmapId), topicId: topic.topicId });
  }
  return { roadmapId: String(roadmap._id || roadmapId), topic: responseTopic, courses };
};

module.exports = { formatCourse, getRoadmapCourseRecommendations, normalizeLevel, normalizeRoleId, rankCourseForTopic, resolveRoadmapTopic };
