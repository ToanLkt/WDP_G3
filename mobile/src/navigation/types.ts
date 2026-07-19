import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type RepositoriesStackParamList = {
  RepoList: undefined;
  RepoDetail: { repoId: string; repoName: string };
  RepoAnalysis: { repoId: string; repoName: string };
  RepoProgress: { repoId: string; repoName: string };
};

export type RoadmapStackParamList = {
  RoadmapList: undefined;
  RoadmapDetail: { roadmapId: string; title: string };
  SkillLearningDetail: { roadmapId: string; skillName: string; nodeId?: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  ConnectGitHub: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  RepositoriesTab: NavigatorScreenParams<RepositoriesStackParamList> | undefined;
  RoadmapTab: NavigatorScreenParams<RoadmapStackParamList> | undefined;
  ChatTab: { repoId?: string; repoName?: string } | undefined;
  NotificationsTab: undefined;
  SettingsTab: NavigatorScreenParams<SettingsStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};
