const mongoose = require('mongoose');
require('dotenv').config();
const Roadmap = require('../src/models/Roadmap');
const LearningContent = require('../src/models/LearningContent');
const LearningResource = require('../src/models/LearningResource');
const learning = require('../src/services/learning.service');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required');
  await mongoose.connect(uri);
  const apply = process.argv.includes('--apply');
  const contents = await LearningContent.find({ roadmapId: { $ne: null }, roadmapItemId: { $nin: ['', null] } }).lean();
  let processed = 0;
  for (const content of contents) {
    const roadmap = await Roadmap.findById(content.roadmapId).lean();
    const phases = Array.isArray(roadmap?.mainRoadmap?.phases) ? roadmap.mainRoadmap.phases : roadmap?.mainPath?.phases || [];
    const task = phases.flatMap((phase) => phase.tasks || []).find((item) => item.itemId === content.roadmapItemId);
    if (!task) continue;
    const query = { skillName: task.canonicalSkillName || task.skillName, canonicalSkillName: task.canonicalSkillName || task.skillName, targetRole: task.targetRole || roadmap.targetRole, level: task.level || roadmap.effectiveLevel, language: roadmap.language || 'vi', roadmapId: String(roadmap._id), roadmapItemId: task.itemId, contentCacheKey: task.itemId, taskTitle: task.title, taskDescription: task.description || '', projectType: roadmap.roadmapSource?.projectType };
    const profile = learning.buildLearningTopicProfile(query);
    const existing = await LearningResource.find({ roadmapId: roadmap._id, roadmapItemId: task.itemId, normalizedTopicKey: profile.normalizedTopicKey }).lean();
    if (learning.hasValidLearningVideo(existing, profile)) continue;
    console.log(JSON.stringify({ roadmapId: String(roadmap._id), itemId: task.itemId, taskTitle: task.title, query: profile.primaryQuery, selectedVideo: null, result: apply ? 'searching' : 'dry_run_missing_resource' }));
    if (apply) {
      try {
        const result = await learning.searchAndCacheYoutubeResources(query);
        console.log(JSON.stringify({ roadmapId: String(roadmap._id), itemId: task.itemId, selectedVideo: result.data.resources?.[0]?.title || null, score: result.data.resources?.[0]?.score || null, result: result.data.resources?.length ? 'backfilled' : 'not_found' }));
      } catch (error) {
        console.warn(JSON.stringify({ roadmapId: String(roadmap._id), itemId: task.itemId, result: 'search_failed', reason: error.message }));
      }
      await delay(350);
    }
    processed += 1;
  }
  console.log(JSON.stringify({ apply, processed, databaseModified: apply }));
};
run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
