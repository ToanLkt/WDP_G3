import { dashboardApi } from '../api/dashboard';
import { extractApiResource } from '../api/client';

export interface DashboardData {
  github_connected: boolean;
  total_repos: number;
  analyzed_repos: number;
  current_skill_direction: string;
}

export const fetchDashboardData = async (): Promise<DashboardData> => {
  const payload = await dashboardApi.me();
  const data = extractApiResource<Record<string, unknown>>(payload, []);

  if (!data) {
    throw new Error('Failed to retrieve dashboard summaries.');
  }

  const repositories = (data.repositories as Record<string, unknown>) || {};
  const github = (data.github as Record<string, unknown>) || {};

  return {
    github_connected: Boolean(github.connected ?? data.githubConnected),
    total_repos: Number(repositories.total ?? data.totalRepositories ?? 0),
    analyzed_repos: Number(repositories.analyzed ?? data.analyzedRepositories ?? 0),
    current_skill_direction: String(data.suggestedCareerPath ?? data.currentSkillDirection ?? 'Generalist Software Engineer'),
  };
};

export const fetchDashboardDataWithFallback = async (
  githubConnected: boolean,
  repos: Array<{ is_analyzed?: boolean }>
): Promise<DashboardData> => {
  try {
    return await fetchDashboardData();
  } catch {
    return {
      github_connected: githubConnected,
      total_repos: repos.length,
      analyzed_repos: repos.filter((repo) => repo.is_analyzed).length,
      current_skill_direction: 'Generalist Software Engineer',
    };
  }
};
