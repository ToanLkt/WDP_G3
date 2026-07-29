const mongoose = require('mongoose');
const dotenv = require('dotenv');
const crypto = require('crypto');
const Roadmap = require('../src/models/Roadmap');
dotenv.config();

const slug = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
const idFor = (roadmapId, task, scope, seen) => {
  const seed = `${roadmapId}|${scope}|${task.itemId || ''}|${task.title || ''}|${task.canonicalSkillName || task.skillName || ''}`;
  const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 10);
  let id = `${scope === 'alt' ? 'alt' : 'main'}-${slug(task.canonicalSkillName || task.skillName)}-${hash}`;
  let n = 2; while (seen.has(id)) id = `${idFor(roadmapId, task, scope, new Set())}-${n++}`;
  return id;
};
const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI or MONGODB_URI is required');
  await mongoose.connect(uri);
  const apply = process.argv.includes('--apply');
  const docs = await Roadmap.find({ isDeleted: { $ne: true } });
  for (const roadmap of docs) {
    const phases = Array.isArray(roadmap.mainRoadmap?.phases) ? roadmap.mainRoadmap.phases : roadmap.mainPath?.phases || [];
    const entries = phases.flatMap((phase) => (phase.tasks || []).map((task) => ({ task, scope: 'main' })));
    (roadmap.alternativeRoadmaps || []).forEach((path) => (path.tasks || []).forEach((task) => entries.push({ task, scope: 'alt' })));
    const counts = new Map(); entries.forEach(({ task }) => { const id = String(task.itemId || '').trim(); if (id) counts.set(id, (counts.get(id) || 0) + 1); });
    const seen = new Set(); let changed = false;
    entries.forEach(({ task, scope }) => {
      const oldId = String(task.itemId || '').trim();
      if (oldId && counts.get(oldId) === 1) { seen.add(oldId); return; }
      const newId = idFor(roadmap._id, task, scope, seen); seen.add(newId); changed = true;
      console.log(JSON.stringify({ roadmapId: String(roadmap._id), title: task.title, oldItemId: oldId, newItemId: newId, reason: oldId ? 'duplicate' : 'missing' }));
      if (apply) task.itemId = newId;
    });
    if (apply && changed) { await roadmap.save(); console.log(`APPLIED roadmap ${roadmap._id}; ambiguous learning content must regenerate`); }
  }
  console.log(apply ? 'Migration apply complete' : 'Dry-run complete; database was not modified');
};
run().catch((e) => { console.error(e.message); process.exitCode = 2; }).finally(() => mongoose.disconnect());
