import { githubApi } from '../api/github';
import { analysisApi } from '../api/analysis';
import { extractApiResource } from '../api/client';
import { normalizeAnalyses, normalizeRepositories } from '../api/normalizers';

export interface Repository {
  id: string;
  name: string;
  fullName?: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  url: string;
  updated_at: string;
  has_readme: boolean;
  is_analyzed: boolean;
}

export interface RepoFilters {
  search?: string;
  language?: string;
  status?: 'analyzed' | 'not_analyzed' | 'all';
  sortBy?: 'name' | 'updated';
}

const toMobileRepository = (
  repo: ReturnType<typeof normalizeRepositories>[number],
  analyzedRepoIds: Set<string>,
  repoReadmes: Map<string, boolean>
): Repository => {
  const isAnalyzed = analyzedRepoIds.has(repo.id) || repo.analyzed;
  const hasReadme = repoReadmes.get(repo.id) ?? repo.hasReadme;

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.fullName,
    description: repo.description || '',
    language: repo.language || 'Unknown',
    stars: repo.stars ?? 0,
    forks: repo.forks ?? 0,
    url: repo.url || '#',
    updated_at: repo.updatedAt,
    has_readme: hasReadme,
    is_analyzed: isAnalyzed,
  };
};

export const fetchRepositories = async (sync = false): Promise<Repository[]> => {
  const repoPayload = sync
    ? await githubApi.syncRepositories({ sync: true })
    : await githubApi.getCachedRepositories();
  const rawRepos = normalizeRepositories(repoPayload);

  let analyzedRepoIds = new Set<string>();
  const repoReadmes = new Map<string, boolean>();

  try {
    const analysisPayload = await analysisApi.getMine();
    const analyses = normalizeAnalyses(analysisPayload);
    analyses.forEach((analysis) => {
      if (analysis.repositoryId) {
        analyzedRepoIds.add(String(analysis.repositoryId));
        repoReadmes.set(String(analysis.repositoryId), Boolean(analysis.checklist?.hasReadme));
      }
    });
  } catch {
    // Continue without analysis metadata
  }

  return rawRepos.map((repo) => toMobileRepository(repo, analyzedRepoIds, repoReadmes));
};

export const filterRepositories = (repos: Repository[], filters: RepoFilters): Repository[] => {
  let result = [...repos];

  if (filters.search && filters.search.trim().length > 0) {
    const query = filters.search.toLowerCase().trim();
    result = result.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        repo.description.toLowerCase().includes(query)
    );
  }

  if (filters.language && filters.language !== 'All') {
    result = result.filter(
      (repo) => repo.language.toLowerCase() === filters.language?.toLowerCase()
    );
  }

  if (filters.status && filters.status !== 'all') {
    if (filters.status === 'analyzed') {
      result = result.filter((repo) => repo.is_analyzed);
    } else if (filters.status === 'not_analyzed') {
      result = result.filter((repo) => !repo.is_analyzed);
    }
  }

  if (filters.sortBy) {
    if (filters.sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filters.sortBy === 'updated') {
      result.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
  }

  return result;
};

export const analyzeRepository = async (repoId: string): Promise<string> => {
  if (!repoId?.trim()) {
    throw new Error('Repository ID không hợp lệ. Hãy refresh danh sách repo rồi thử lại.');
  }

  try {
    await githubApi.syncPackages(repoId);
    await githubApi.syncCommits(repoId);
  } catch {
    // Continue even if sync fails
  }

  await analysisApi.analyzeRepository(repoId);
  return repoId;
};

export const fetchRepositoryDetail = async (repoId: string) => {
  const payload = await githubApi.getRepository(repoId);
  return extractApiResource(payload, ['repository', 'repo']);
};

export const fetchFilteredRepositories = async (filters: RepoFilters) => {
  const list = await fetchRepositories(false);
  return filterRepositories(list, filters);
};
