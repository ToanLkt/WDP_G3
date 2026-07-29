const mongoose = require('mongoose');
require('dotenv').config();
const LearningContent = require('../src/models/LearningContent');
const LearningResource = require('../src/models/LearningResource');

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required');
  await mongoose.connect(uri);
  const apply = process.argv.includes('--apply');
  const staleContent = await LearningContent.find({
    $or: [{ roadmapItemId: { $in: ['', null] } }, { normalizedTopicKey: { $in: ['', null] } }],
  }).select('_id roadmapId roadmapItemId title').lean();
  const staleResources = await LearningResource.find({
    $or: [{ roadmapItemId: { $in: ['', null] } }, { normalizedTopicKey: { $in: ['', null] } }],
  }).select('_id roadmapId roadmapItemId title').lean();
  staleContent.forEach((record) => console.log(JSON.stringify({ entity: 'LearningContent', oldItemId: record.roadmapItemId || null, title: record.title, action: 'mark_stale', reason: 'missing_topic_identity' })));
  staleResources.forEach((record) => console.log(JSON.stringify({ entity: 'LearningResource', oldItemId: record.roadmapItemId || null, title: record.title, action: 'mark_stale', reason: 'missing_topic_identity' })));
  if (apply) {
    await LearningContent.updateMany({ _id: { $in: staleContent.map((item) => item._id) } }, { $set: { isStale: true } });
    await LearningResource.updateMany({ _id: { $in: staleResources.map((item) => item._id) } }, { $set: { isStale: true } });
  }
  console.log(JSON.stringify({ apply, staleLearningContent: staleContent.length, staleLearningResources: staleResources.length, databaseModified: apply }));
};
run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
