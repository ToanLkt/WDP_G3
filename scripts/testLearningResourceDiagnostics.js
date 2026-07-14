const assert = require('assert');

const learningService = require('../src/services/learning.service');
const roadmapLearningService = require('../src/services/roadmapLearning.service');
const { calculateYouTubeVideoScore } = require('../src/services/youtube.service');

async function main() {
  const searchContext = learningService.buildResourceSearchContext({
    skillName: 'Component Design',
    targetRole: 'Frontend Developer',
    level: 'intermediate',
    language: 'vi',
    taskTitle: 'Viet unit tests cho cac Component Design quan trong',
    taskDescription: 'Dung React Testing Library va Jest de test component.',
  });

  assert(
    /react component unit testing/i.test(searchContext.primaryQuery),
    `testing task query should prioritize testing keywords: ${searchContext.primaryQuery}`
  );
  assert(searchContext.relevanceTerms.includes('testing'), 'relevance terms should include testing');
  assert(searchContext.relevanceTerms.includes('react testing library'), 'relevance terms should include React Testing Library');

  const score = calculateYouTubeVideoScore({
    title: 'React Testing Library Tutorial - Test React Components',
    description: 'Learn unit testing for React components using Jest.',
    channelTitle: 'Web Dev Simplified',
    skillName: 'Component Design',
    level: 'intermediate',
    relevanceTerms: searchContext.relevanceTerms,
  });
  assert(score >= 40, `relevance terms should accept a good testing video, got score ${score}`);

  const learning = roadmapLearningService.formatLearning(
    {
      skillName: 'Component Design',
      canonicalSkillName: 'Component Design',
      targetRole: 'Frontend Developer',
      level: 'intermediate',
      language: 'vi',
      title: 'Component Design',
      overview: 'Learn component design.',
    },
    [
      {
        title: 'React Testing Library Tutorial',
        url: 'https://www.youtube.com/watch?v=example',
        provider: 'YouTube',
        thumbnailUrl: 'https://img.youtube.com/example.jpg',
        channelTitle: 'Example Channel',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        source: 'youtube_api',
        score: 75,
      },
    ]
  );

  assert.strictEqual(learning.resources.length, 1, 'roadmap learning response must merge resources into learning.resources');
  assert.strictEqual(learning.resources[0].url, 'https://www.youtube.com/watch?v=example');

  console.log('PASS: learning resource diagnostics');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
