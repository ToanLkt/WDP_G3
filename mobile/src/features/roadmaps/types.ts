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

export interface GenerateRoadmapOptions {
  sourceMode?: 'all_analyzed_repos' | 'single_repo' | 'selected_repos' | string;
  repoId?: string;
  repoIds?: string[];
  roleId?: string;
  selectedRole?: { roleId: string; roleName: string };
  level?: 'beginner' | 'intermediate' | 'advanced' | string;
  durationWeeks?: number;
  language?: string;
  useRoleMatching?: boolean;
  forceRegenerate?: boolean;
  currentRepositoryId?: string;
  selectedRoleId?: string;
  sourceRepositoryId?: string;
  sourceAnalysisId?: string;
  sourceSnapshotId?: string;
}

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
  resources?: LearningResource[];
  skillTags?: string[];
  skillName?: string;
  canonicalSkillName?: string;
  targetRole?: string;
  category?: string;
  priority?: number;
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
  roadmapSource?: {
    selectedRoleId?: string;
    selectedRoleName?: string;
    roleSelectionType?: string;
    sourceRepositoryName?: string;
    fullName?: string;
    repoName?: string;
    pipelineVersion?: string;
    sourceMode?: string;
  } | string;
  roleMatch?: {
    roleId: string;
    roleName: string;
    matchScore: number;
    matchLevel: string;
    matchLevelLabel: string;
    topMatchedSkills?: string[];
    topMissingSkills?: string[];
    recommendedNextSkills?: string[];
  };
  skillGapSummary?: {
    totalGaps: number;
    missingRequiredCount: number;
    weakSkillCount: number;
    recommendedNextSkills: string[];
    prioritySkills: string[];
  };
  requestedLevel?: string;
  effectiveLevel?: string;
  progressSummary?: {
    totalItems?: number;
    completedItems?: number;
    inProgressItems?: number;
  };
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

export interface LearningExample {
  title: string;
  code: string;
  explanation: string;
}

export interface LearningExercise {
  title: string;
  description: string;
}

export interface LearningContent {
  skillName: string;
  targetRole: string;
  level: string;
  language: string;
  title: string;
  overview: string;
  whyLearn: string;
  useCases: string[];
  howToApply: string;
  examples: LearningExample[];
  checklist: string[];
  exercises: LearningExercise[];
  commonMistakes: string[];
  nextSkills: string[];
}

export interface AILearningResource {
  id?: string;
  _id?: string;
  skillName?: string;
  targetRole: string;
  level: string;
  language: string;
  type: string;
  title: string;
  url: string;
  provider: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  source?: string;
  score?: number;
  tags?: string[];
}

export interface RoadmapProgressItem {
  itemId: string;
  skillName?: string;
  canonicalSkillName?: string;
  status: 'not_started' | 'in_progress' | 'completed' | string;
  progressPercent: number;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
}

export interface RoadmapProgressRecord {
  roadmapId: string;
  overallProgress?: number; // may not exist at root level
  items: RoadmapProgressItem[];
  progressSummary?: {
    totalItems?: number;
    completedItems?: number;
    inProgressItems?: number;
    notStartedItems?: number;
    overallProgress?: number;       // API puts overall % HERE (e.g. 4 = 4%)
    overallProgressPercent?: number; // fallback alias
  };
}

export interface IntegratedLearningListItem {
  itemId: string;
  taskTitle: string;
  canonicalSkillName: string;
  skillName: string;
  targetRole: string;
  level: string;
  week: number;
  priority: string;
  learningStatus: 'available' | 'missing' | string;
}

export interface IntegratedLearningListResponse {
  roadmapId: string;
  sourceMode: string;
  language: string;
  items: IntegratedLearningListItem[];
}

export interface IntegratedLearningItemResponse {
  roadmapId: string;
  itemId: string;
  task: {
    title: string;
    description: string;
    skillName?: string;
    canonicalSkillName?: string;
    category?: string;
    targetRole?: string;
    level?: string;
    week?: number;
    priority?: string;
    estimatedHours?: number;
  };
  learning?: LearningContent;
  personalizedContext?: {
    sourceMode?: string;
    repoName?: string;
    projectType?: string;
    repositoryNames?: string[];
    practiceTask?: string;
    roadmapReason?: string;
  };
  progress?: {
    status: string;
    progressPercent: number;
  } | null;
}

