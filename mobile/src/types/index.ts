export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  githubConnected: boolean;
  githubUsername?: string;
  createdAt: string;
}

export interface Profile {
  id?: string;
  fullName: string;
  university: string;
  major: string;
  year: number;
  targetCareer: string;
  currentSkills: string[];
  githubUsername?: string;
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
  hasReadme: boolean;
  analyzed: boolean;
  analysisId?: string;
  url: string;
  private: boolean;
}

export interface RepositoryPackageFile {
  name?: string;
  path?: string;
  type?: string;
  content?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface RepositoryCommit {
  id?: string;
  sha?: string;
  message?: string;
  author?: string;
  date?: string;
  url?: string;
}

export interface AnalysisResult {
  id: string;
  repositoryId: string;
  repositoryName: string;
  repoName?: string;
  fullName?: string;
  createdAt: string;
  projectType: string;
  techStack: string[];
  languages?: string[];
  frameworks?: string[];
  packages?: string[];
  skillSignals?: string[];
  careerSignals?: string[];
  scores: {
    architecture: number;
    completeness: number;
    commitQuality: number;
    documentation: number;
    codeConvention: number;
    overall: number;
    techStackScore?: number;
    documentationScore?: number;
    commitQualityScore?: number;
    deploymentScore?: number;
    testingScore?: number;
    portfolioReadinessScore?: number;
    overallScore?: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: Recommendation[];
  missingSkills: Skill[];
  careerDirection: CareerDirection;
  commitSummary?: CommitSummary;
  checklist?: AnalysisChecklist;
  portfolioReadiness: PortfolioChecklist;
}

export interface CommitSummary {
  totalCommits: number;
  activeDays: number;
  vagueCommitRatio: number;
  conventionalCommitRatio: number;
  firstCommitDate?: string;
  lastCommitDate?: string;
}

export interface AnalysisChecklist {
  hasReadme: boolean;
  hasEnvExample: boolean;
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasCICD: boolean;
  hasTesting: boolean;
  hasLinting: boolean;
  hasFormatter: boolean;
  hasPackageFile: boolean;
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: 'architecture' | 'documentation' | 'testing' | 'security' | 'performance' | 'other';
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  importance: 'high' | 'medium' | 'low';
}

export interface CareerDirection {
  primary: string;
  secondary: string[];
  confidence: number;
  reasoning: string;
}

export interface PortfolioChecklist {
  items: {
    label: string;
    completed: boolean;
    importance: 'critical' | 'important' | 'nice-to-have';
  }[];
  overallReadiness: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  repositoryContext?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIFeedback {
  id?: string;
  repositoryId?: string;
  analysisSnapshotId?: string;
  githubRepoId?: number;
  repoName?: string;
  fullName?: string;
  projectType?: string;
  careerDirection?: string;
  createdAt?: string;
  generatedAt?: string;
  summary?: string;
  feedback?: string;
  strengthFeedback?: string[];
  weaknessFeedback?: string[];
  learningAdvice?: string;
  nextSteps?: string[];
  recommendedTopics?: string[];
  careerSuggestion?: string;
  portfolioAdvice?: string;
  riskNotes?: string[];
  recommendations?: string[];
  raw?: unknown;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt?: string;
}

export interface DashboardStats {
  totalRepositories: number;
  analyzedRepositories: number;
  githubConnected: boolean;
  skillOverview: {
    frontend: number;
    backend: number;
    devops: number;
    testing: number;
  };
  languageDistribution: {
    language: string;
    count: number;
    percentage: number;
  }[];
  recentAnalyses: AnalysisResult[];
}

export interface ProgressData {
  date: string;
  scores: {
    architecture: number;
    documentation: number;
    overall: number;
  };
}
