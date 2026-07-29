const mongoose = require('mongoose');
require('dotenv').config();
const Roadmap = require('../src/models/Roadmap');
const LearningContent = require('../src/models/LearningContent');
const LearningResource = require('../src/models/LearningResource');
const learning = require('../src/services/learning.service');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required (read-only audit)');
  await mongoose.connect(uri);
  const contents = await LearningContent.find({ roadmapId: { $ne: null }, roadmapItemId: { $nin: ['', null] } }).lean();
  const report = [];
  for (const content of contents) {
    const roadmap = await Roadmap.findById(content.roadmapId).lean();
    const phases = Array.isArray(roadmap?.mainRoadmap?.phases) ? roadmap.mainRoadmap.phases : roadmap?.mainPath?.phases || [];
    const task = phases.flatMap((phase) => phase.tasks || []).find((item) => item.itemId === content.roadmapItemId);
    const profile = learning.buildLearningTopicProfile({
      skillName: task?.canonicalSkillName || content.canonicalSkillName,
      targetRole: task?.targetRole || roadmap?.targetRole || content.targetRole,
      level: task?.level || roadmap?.effectiveLevel || content.level,
      language: roadmap?.language || content.language,
      taskTitle: task?.title || content.title,
      taskDescription: task?.description || '',
    });
    const resources = await LearningResource.find({ roadmapId: content.roadmapId, roadmapItemId: content.roadmapItemId, normalizedTopicKey: profile.normalizedTopicKey }).lean();
    const valid = learning.hasValidLearningVideo(resources, profile);
    report.push({ roadmapId: String(content.roadmapId), roadmapItemId: content.roadmapItemId, taskTitle: task?.title || '', learningTitle: content.title, resourceCount: resources.length, hasValidVideo: valid, normalizedTopicKey: content.normalizedTopicKey || profile.normalizedTopicKey, createdAt: content.createdAt, updatedAt: content.updatedAt, action: valid ? 'valid' : resources.length ? 'invalid_video' : 'missing_resource' });
  }
  console.log(JSON.stringify({ totalLearningContents: report.length, missingResources: report.filter((item) => item.action !== 'valid').length, report, note: 'Dry-run only; database was not modified.' }, null, 2));
};
run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
