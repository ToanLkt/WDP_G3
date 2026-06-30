export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type RepositoriesStackParamList = {
  RepoList: undefined;
  RepoAnalysis: { repoId: string; repoName: string };
  ConnectGitHub: undefined;
};

export type RoadmapStackParamList = {
  RoadmapList: undefined;
  RoadmapDetail: { roadmapId: string; title: string };
  SkillLearningDetail: { roadmapId: string; skillName: string; nodeId?: string };
};

export type MainTabParamList = {
  HomeTab: undefined;
  RepositoriesTab: undefined;
  RoadmapTab: undefined;
  ChatTab: { repoId?: string; repoName?: string } | undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};
