import { dashboardApi } from '../api/dashboard';
import { extractApiResource } from '../api/client';

export interface DashboardOverview {
  user: {
    _id: string;
    name: string;
    email: string;
  };
  github: {
    connected: boolean;
    username: string | null;
  };
  repositories: {
    total: number;
    analyzed: number;
    unanalyzed: number;
  };
  skills: {
    strong: string[];
    missing: string[];
  };
  suggestedCareerPath: string | null;
  roadmapProgress: number;
  latestAnalysisAt: string | null;
}

export const fetchDashboardOverview = async (): Promise<DashboardOverview> => {
  const payload = await dashboardApi.me();
  const data = extractApiResource<Record<string, unknown>>(payload, []);

  if (!data) {
    throw new Error('Không thể tải dữ liệu dashboard.');
  }

  const repositories = (data.repositories as Record<string, unknown>) || {};
  const github = (data.github as Record<string, unknown>) || {};
  const skills = (data.skills as Record<string, unknown>) || {};
  const user = (data.user as Record<string, unknown>) || {};

  return {
    user: {
      _id: String(user._id ?? ''),
      name: String(user.name ?? ''),
      email: String(user.email ?? ''),
    },
    github: {
      connected: Boolean(github.connected),
      username: github.username ? String(github.username) : null,
    },
    repositories: {
      total: Number(repositories.total ?? 0),
      analyzed: Number(repositories.analyzed ?? 0),
      unanalyzed: Number(repositories.unanalyzed ?? 0),
    },
    skills: {
      strong: Array.isArray(skills.strong) ? skills.strong.map(String) : [],
      missing: Array.isArray(skills.missing) ? skills.missing.map(String) : [],
    },
    suggestedCareerPath: data.suggestedCareerPath ? String(data.suggestedCareerPath) : null,
    roadmapProgress: Number(data.roadmapProgress ?? 0),
    latestAnalysisAt: data.latestAnalysisAt ? String(data.latestAnalysisAt) : null,
  };
};
