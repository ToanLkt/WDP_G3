export type RoadmapCategory =
  | 'Frontend'
  | 'Backend'
  | 'Fullstack'
  | 'DevOps'
  | 'Mobile'
  | 'AI/ML'
  | 'System Design'
  | 'Testing'
  | 'Blockchain'
  | 'Cloud';

export type RoadmapDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type LearningNodeStatus = 'locked' | 'unlocked' | 'in-progress' | 'completed';
export type ResourceType = 'article' | 'video' | 'docs' | 'course' | 'repo' | 'exercise';

export interface LearningResource {
  id: string;
  title: string;
  type: ResourceType;
  url: string;
  provider: string;
  estimatedMinutes: number;
}

export interface LearningNode {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
  difficulty: RoadmapDifficulty;
  dependencies: string[];
  status: LearningNodeStatus;
  skills: string[];
  resources: LearningResource[];
  project?: string;
  bookmarked?: boolean;
  xp: number;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string;
  targetWeek: number;
  nodeIds: string[];
  rewardXp: number;
  completed: boolean;
}

export interface RoadmapModule {
  id: string;
  title: string;
  description: string;
  order: number;
  estimatedHours: number;
  nodes: LearningNode[];
  milestones: RoadmapMilestone[];
}

export interface Roadmap {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: RoadmapCategory;
  difficulty: RoadmapDifficulty;
  estimatedWeeks: number;
  estimatedHours: number;
  requiredSkills: string[];
  objectives: string[];
  tags: string[];
  popularity: number;
  rating: number;
  learners: number;
  isFeatured: boolean;
  isAIRecommended: boolean;
  progress: number;
  modules: RoadmapModule[];
  createdFrom?: 'manual' | 'ai';
  careerOutcome: string;
  status?: 'active' | 'archived';
  createdAt?: string;
  updatedAt?: string;
  sourceRepositoriesCount?: number;
  missingSkills?: string[];
  supportingPaths?: {
    id: string;
    title: string;
    reason: string;
    skills: string[];
    suggestedTasks: string[];
  }[];
}

export interface SkillGapAnalysis {
  skill: string;
  category: RoadmapCategory;
  currentScore: number;
  targetScore: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  evidence: string;
  recommendedNodeIds: string[];
}

export interface AIRecommendation {
  id: string;
  generatedAt: string;
  summary: string;
  confidence: number;
  sourceRepositories: string[];
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  commitPatternInsight: string;
  complexityInsight: string;
  careerSuggestion: string;
  estimatedCompletionWeeks: number;
  skillGaps: SkillGapAnalysis[];
  roadmap: Roadmap;
}

export type RoadmapListParams = {
  status?: 'active' | 'archived';
  targetRole?: string;
};
