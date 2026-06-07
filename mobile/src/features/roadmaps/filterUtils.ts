import type { Roadmap, RoadmapCategory, RoadmapDifficulty } from './types';

export type RoadmapFilters = {
  search: string;
  category: RoadmapCategory | 'All';
  difficulty: RoadmapDifficulty | 'All';
  duration: 'All' | 'Short' | 'Medium' | 'Long';
};

export const defaultRoadmapFilters: RoadmapFilters = {
  search: '',
  category: 'All',
  difficulty: 'All',
  duration: 'All',
};

export const filterRoadmaps = (roadmaps: Roadmap[], filters: RoadmapFilters) => {
  const query = filters.search.trim().toLowerCase();

  return roadmaps.filter((roadmap) => {
    if (filters.category !== 'All' && roadmap.category !== filters.category) return false;
    if (filters.difficulty !== 'All' && roadmap.difficulty !== filters.difficulty) return false;

    if (filters.duration === 'Short' && roadmap.estimatedWeeks > 4) return false;
    if (filters.duration === 'Medium' && (roadmap.estimatedWeeks <= 4 || roadmap.estimatedWeeks > 10)) return false;
    if (filters.duration === 'Long' && roadmap.estimatedWeeks <= 10) return false;

    if (!query) return true;

    const haystack = [
      roadmap.title,
      roadmap.subtitle,
      roadmap.description,
      roadmap.careerOutcome,
      ...roadmap.tags,
      ...roadmap.requiredSkills,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
};

export const countRoadmapNodes = (roadmap: Roadmap) =>
  roadmap.modules.reduce((sum, module) => sum + module.nodes.length, 0);

export const countCompletedNodes = (roadmap: Roadmap) =>
  roadmap.modules.reduce(
    (sum, module) => sum + module.nodes.filter((node) => node.status === 'completed').length,
    0
  );

export const formatDifficulty = (difficulty: RoadmapDifficulty) => {
  if (difficulty === 'Beginner') return 'Cơ bản';
  if (difficulty === 'Intermediate') return 'Trung cấp';
  return 'Nâng cao';
};
