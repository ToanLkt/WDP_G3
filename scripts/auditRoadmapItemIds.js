const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Roadmap = require('../src/models/Roadmap');

dotenv.config();

const asArray = (value) => (Array.isArray(value) ? value : []);
const taskEntries = (roadmap) => {
  const out = [];
  const addPath = (phases, roadmapType) => asArray(phases).forEach((phase, phaseIndex) =>
    asArray(phase?.tasks).forEach((task, taskIndex) => out.push({ roadmapType, phaseIndex, taskIndex, task }))
  );
  // mainPath is the legacy mirror of mainRoadmap in many documents; audit one canonical copy.
  addPath(
    Array.isArray(roadmap?.mainRoadmap?.phases) ? roadmap.mainRoadmap.phases : roadmap?.mainPath?.phases,
    Array.isArray(roadmap?.mainRoadmap?.phases) ? 'mainRoadmap' : 'mainPath'
  );
  asArray(roadmap?.alternativeRoadmaps).forEach((path, pathIndex) => {
    addPath(path?.phases, `alternativeRoadmap[${pathIndex}].phases`);
    asArray(path?.tasks).forEach((task, taskIndex) => out.push({ roadmapType: `alternativeRoadmap[${pathIndex}]`, phaseIndex: 0, taskIndex, task }));
  });
  return out;
};

const reportTask = (roadmapId, entry) => ({
  roadmapId: String(roadmapId), roadmapType: entry.roadmapType, phaseIndex: entry.phaseIndex,
  taskIndex: entry.taskIndex, title: String(entry.task?.title || ''),
  canonicalSkillName: String(entry.task?.canonicalSkillName || entry.task?.skillName || ''),
  itemId: String(entry.task?.itemId || '').trim(),
});

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required (read-only audit)');
  await mongoose.connect(uri);
  const roadmaps = await Roadmap.find({ isDeleted: { $ne: true } }).lean();
  const all = roadmaps.flatMap((roadmap) => taskEntries(roadmap).map((entry) => reportTask(roadmap._id, entry)));
  const byRoadmap = new Map(); const byId = new Map();
  all.forEach((item) => {
    if (!byRoadmap.has(item.roadmapId)) byRoadmap.set(item.roadmapId, new Map());
    if (item.itemId) {
      if (!byRoadmap.get(item.roadmapId).has(item.itemId)) byRoadmap.get(item.roadmapId).set(item.itemId, []);
      byRoadmap.get(item.roadmapId).get(item.itemId).push(item);
      if (!byId.has(item.itemId)) byId.set(item.itemId, []);
      byId.get(item.itemId).push(item);
    }
  });
  const within = [...byRoadmap.values()].flatMap((m) => [...m.values()].filter((x) => x.length > 1));
  const across = [...byId.values()].filter((x) => new Set(x.map((i) => i.roadmapId)).size > 1);
  const missing = all.filter((x) => !x.itemId);
  const cacheCollisions = [...byId.values()].filter((x) => new Set(x.map((i) => `${i.canonicalSkillName}|${i.title}`)).size > 1);
  console.log(JSON.stringify({ totalRoadmaps: roadmaps.length, totalTasks: all.length, missingItemIds: missing.length, duplicateIdsWithinRoadmap: within.length, duplicateIdsAcrossRoadmaps: across.length, ambiguousLearningLookups: within.length, potentialLearningContentCacheCollisions: cacheCollisions.length }, null, 2));
  [...within.flat(), ...across.flat()].forEach((item) => console.log(JSON.stringify(item)));
  process.exitCode = within.length || missing.length ? 1 : 0;
};

run().catch((error) => { console.error(error.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
