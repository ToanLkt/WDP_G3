import type { Repository } from '../../types';
import { asArray, asNumber, asRecord, extractObject, firstString } from './helpers';

export const normalizeRepository = (payload: unknown): Repository => {
  const repo = asRecord(extractObject(payload, ['repository', 'repo']));
  const owner = asRecord(repo.owner);
  const id = firstString(repo._id, repo.id, repo.githubRepoId, repo.githubId, repo.repoId);
  const fullName = firstString(repo.fullName, repo.full_name, `${firstString(owner.login)}/${firstString(repo.name)}`).replace(/^\//, '');

  return {
    id,
    name: firstString(repo.name, fullName.split('/').pop(), 'Repository'),
    fullName,
    description: firstString(repo.description) || undefined,
    language: firstString(repo.language, 'Unknown'),
    stars: asNumber(repo.stars ?? repo.stargazersCount ?? repo.stargazers_count),
    forks: asNumber(repo.forks ?? repo.forksCount ?? repo.forks_count),
    updatedAt: firstString(repo.updatedAt, repo.updated_at, repo.pushedAt, repo.pushed_at, new Date().toISOString()),
    hasReadme: Boolean(repo.hasReadme ?? repo.readme ?? repo.readmeUrl),
    analyzed: Boolean(repo.analyzed ?? repo.hasAnalysis ?? repo.analysisId),
    analysisId: firstString(repo.analysisId, repo.latestAnalysisId) || undefined,
    url: firstString(repo.url, repo.htmlUrl, repo.html_url, repo.cloneUrl, '#'),
    private: Boolean(repo.private ?? repo.isPrivate),
  };
};

export const normalizeRepositories = (payload: unknown) => {
  return asArray(payload).map(normalizeRepository);
};
