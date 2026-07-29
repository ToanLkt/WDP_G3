const assert = require('assert');
const roadmap = require('../src/services/roadmap.service');
const learning = require('../src/services/roadmapLearning.service');

const payload = roadmap.normalizeRoadmapPayload({
  targetRole: 'Frontend Developer', durationWeeks: 1, language: 'vi',
  roadmapData: { mainPath: { title: 'test', phases: [{ title: 'W1', tasks: [
    { title: 'Phân tích và chia nhỏ giao diện người dùng', canonicalSkillName: 'Component Design' },
    { title: 'Tái cấu trúc component hiện có để tăng tính tái sử dụng', canonicalSkillName: 'Component Design' },
    { title: 'Xây dựng các component cơ bản với Props', canonicalSkillName: 'Component Design' },
  ] }] }, supportingPaths: [] }, sourceContextSummary: {}, roadmapGapContext: { skillGaps: [] }, skillGapSummary: [],
});
const tasks = payload.mainRoadmap.phases[0].tasks;
assert.strictEqual(new Set(tasks.map((task) => task.itemId)).size, tasks.length);
const existing = tasks[0].itemId;
const reloaded = JSON.parse(JSON.stringify(payload));
reloaded.mainRoadmap.phases[0].tasks.reverse();
assert.strictEqual(reloaded.mainRoadmap.phases[0].tasks.find((task) => task.title === tasks[0].title).itemId, existing);
assert.strictEqual(learning.findRoadmapTaskByItemId(reloaded, existing).title, tasks[0].title);
const conflict = JSON.parse(JSON.stringify(payload));
conflict.mainRoadmap.phases[0].tasks[1].itemId = existing;
assert.throws(() => learning.findRoadmapTaskByItemId(conflict, existing), (error) => error.code === 'ROADMAP_ITEM_ID_CONFLICT');
console.log('PASS: roadmap itemId uniqueness, preservation, reorder and conflict behavior');
