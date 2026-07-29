const mongoose = require('mongoose');
require('dotenv').config();
const Roadmap = require('../src/models/Roadmap');
const RoadmapProgress = require('../src/models/RoadmapProgress');
const LearningContent = require('../src/models/LearningContent');
const LearningResource = require('../src/models/LearningResource');
const learning = require('../src/services/learning.service');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required (read-only audit)');
  await mongoose.connect(uri);
  const roadmaps = await Roadmap.find({ isDeleted: { $ne: true } }).lean();
  const report = [];
  for (const roadmap of roadmaps) {
    const phases = Array.isArray(roadmap.mainRoadmap?.phases) ? roadmap.mainRoadmap.phases : roadmap.mainPath?.phases || [];
    for (const phase of phases) for (const task of phase.tasks || []) {
      const profile = learning.buildLearningTopicProfile({
        skillName: task.canonicalSkillName || task.skillName,
        targetRole: task.targetRole || roadmap.targetRole,
        level: task.level || roadmap.effectiveLevel,
        language: roadmap.language,
        taskTitle: task.title,
        taskDescription: task.description,
        projectType: roadmap.roadmapSource?.projectType,
      });
      const content = await LearningContent.findOne({ roadmapId: roadmap._id, roadmapItemId: task.itemId }).lean();
      const resources = await LearningResource.find({ roadmapId: roadmap._id, roadmapItemId: task.itemId }).lean();
      const haystack = `${content?.title || ''} ${content?.overview || ''}`.toLowerCase();
      const matchedKeywords = profile.specificKeywords.filter((keyword) => haystack.includes(keyword.toLowerCase()));
      report.push({
        roadmapId: String(roadmap._id),
        itemId: task.itemId || '',
        taskTitle: task.title || '',
        learningTitle: content?.title || '',
        resourceTitle: resources[0]?.title || '',
        matchedKeywords,
        missingKeywords: profile.specificKeywords.filter((keyword) => !matchedKeywords.includes(keyword)),
        action: !task.itemId ? 'missing_item_id' : !content ? 'generate' : matchedKeywords.length < Math.min(2, profile.specificKeywords.length) ? 'mark_stale_regenerate' : 'ok',
      });
    }
  }
  const summary = {
    totalRoadmaps: roadmaps.length,
    itemsAudited: report.length,
    staleTopicItems: report.filter((item) => item.action === 'mark_stale_regenerate').length,
    missingContentItems: report.filter((item) => item.action === 'generate').length,
    report,
    note: 'Dry-run only; database was not modified.',
  };
  console.log(JSON.stringify(summary, null, 2));
};
run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
