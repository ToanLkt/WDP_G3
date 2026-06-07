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

export type AnalyzeRepositoryOptions = {
  /** Re-fetch packages/commits from GitHub before analyzing */
  forceRefresh?: boolean;
};

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

const loadAnalysisMetadata = async () => {
  const analyzedRepoIds = new Set<string>();
  const repoReadmes = new Map<string, boolean>();

  try {
    const analysisPayload = await analysisApi.getMine();
    const list = extractApiResource<unknown>(analysisPayload, ['analyses', 'results', 'items', 'snapshots']);
    const analyses = normalizeAnalyses(Array.isArray(list) ? list : analysisPayload);

    analyses.forEach((analysis) => {
      if (analysis.repositoryId) {
        analyzedRepoIds.add(String(analysis.repositoryId));
        repoReadmes.set(String(analysis.repositoryId), Boolean(analysis.checklist?.hasReadme));
      }
    });
  } catch {
    // Continue without analysis metadata
  }

  return { analyzedRepoIds, repoReadmes };
};

const buildRepositoryList = async (repoPayload: unknown): Promise<Repository[]> => {
  const rawRepos = normalizeRepositories(repoPayload);
  const { analyzedRepoIds, repoReadmes } = await loadAnalysisMetadata();
  return rawRepos.map((repo) => toMobileRepository(repo, analyzedRepoIds, repoReadmes));
};

/** GET /github/repositories/cached — fast list from database */
export const fetchCachedRepositoriesList = async (): Promise<Repository[]> => {
  const repoPayload = await githubApi.getCachedRepositories();
  return buildRepositoryList(repoPayload);
};

/** GET /github/repositories?sync=true — pull from GitHub and sync DB */
export const syncRepositoriesFromGitHub = async (): Promise<Repository[]> => {
  const repoPayload = await githubApi.syncRepositories({ sync: true });
  return buildRepositoryList(repoPayload);
};

/** @deprecated Use fetchCachedRepositoriesList or syncRepositoriesFromGitHub */
export const fetchRepositories = async (sync = false): Promise<Repository[]> => {
  return sync ? syncRepositoriesFromGitHub() : fetchCachedRepositoriesList();
};

const isEmptyGithubResource = (payload: unknown, keys: string[]) => {
  const data = extractApiResource<unknown>(payload, keys);
  if (!data) return true;

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.packages)) return record.packages.length === 0;
    if (Array.isArray(record.commits)) return record.commits.length === 0;
    if (Array.isArray(record.files)) return record.files.length === 0;
    return Object.keys(record).length === 0;
  }

  return false;
};

const hasCachedRepoArtifacts = async (repoId: string) => {
  try {
    const [packagesPayload, commitsPayload] = await Promise.all([
      githubApi.getCachedPackages(repoId),
      githubApi.getCachedCommits(repoId),
    ]);

    const hasPackages = !isEmptyGithubResource(packagesPayload, ['packages', 'files', 'packageFiles']);
    const hasCommits = !isEmptyGithubResource(commitsPayload, ['commits']);
    return hasPackages || hasCommits;
  } catch {
    return false;
  }
};

const syncRepoArtifactsFromGitHub = async (repoId: string) => {
  await Promise.all([
    githubApi.syncPackages(repoId).catch(() => undefined),
    githubApi.syncCommits(repoId, { perPage: 30, includeStats: true }).catch(() => undefined),
  ]);
};

const ensureRepoDataForAnalysis = async (repoId: string, forceRefresh: boolean) => {
  if (forceRefresh) {
    await syncRepoArtifactsFromGitHub(repoId);
    return;
  }

  const hasCached = await hasCachedRepoArtifacts(repoId);
  if (!hasCached) {
    await syncRepoArtifactsFromGitHub(repoId);
  }
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

/**
 * POST /analysis/repositories/{repoId}
 * Uses cached packages/commits when available; syncs from GitHub only when needed.
 */
export const analyzeRepository = async (
  repoId: string,
  options: AnalyzeRepositoryOptions = {}
): Promise<string> => {
  if (!repoId?.trim()) {
    throw new Error('Repository ID không hợp lệ. Hãy refresh danh sách repo rồi thử lại.');
  }

  await ensureRepoDataForAnalysis(repoId, Boolean(options.forceRefresh));
  await analysisApi.analyzeRepository(repoId);
  return repoId;
};

export const fetchRepositoryDetail = async (repoId: string) => {
  const payload = await githubApi.getRepository(repoId);
  return extractApiResource(payload, ['repository', 'repo']);
};

export const fetchFilteredRepositories = async (filters: RepoFilters) => {
  const list = await fetchCachedRepositoriesList();
  return filterRepositories(list, filters);
};
