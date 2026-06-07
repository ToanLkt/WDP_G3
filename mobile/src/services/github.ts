import * as WebBrowser from 'expo-web-browser';
import { githubApi } from '../api/github';
import { extractApiResource, getOAuthCallbackUrl } from '../api/client';
import { normalizeRepositories } from '../api/normalizers';

export interface GitHubUser {
  username: string;
  avatarUrl: string;
  publicRepos: number;
  bio: string;
}

export type GitHubOAuthResult = 'success' | 'cancelled' | 'dismissed';

const resolveOAuthUrl = (payload: Record<string, string | undefined>) => {
  return payload.authorizeUrl
    ?? payload.authorizationUrl
    ?? payload.oauthUrl
    ?? payload.connectUrl
    ?? payload.url;
};

export const fetchOAuthUrl = async (): Promise<string> => {
  const payload = await githubApi.getOAuthUrl('mobile');
  const authorizeUrl = resolveOAuthUrl(payload as Record<string, string | undefined>);

  if (!authorizeUrl) {
    throw new Error('Backend did not return a valid authorizeUrl.');
  }

  return authorizeUrl;
};

export const connectGitHubOAuth = async (): Promise<GitHubOAuthResult> => {
  const authorizeUrl = await fetchOAuthUrl();
  const callbackUrl = getOAuthCallbackUrl();

  WebBrowser.maybeCompleteAuthSession();

  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, callbackUrl);

  if (result.type === 'success') {
    return 'success';
  }

  if (result.type === 'cancel') {
    return 'cancelled';
  }

  return 'dismissed';
};

export const getGitHubOAuthSetupHint = () => {
  const callbackUrl = getOAuthCallbackUrl();
  return `Đảm bảo backend GITHUB_CALLBACK_URL và GitHub OAuth App đều dùng: ${callbackUrl}`;
};

export const fetchGitHubMe = async (): Promise<GitHubUser | null> => {
  try {
    const payload = await githubApi.me();
    const account = extractApiResource<Record<string, unknown>>(payload, ['githubAccount', 'github', 'account', 'user']);

    if (!account || !account.username) {
      return null;
    }

    let publicRepos = 0;
    try {
      const reposPayload = await githubApi.getCachedRepositories();
      const repos = normalizeRepositories(reposPayload);
      publicRepos = repos.length;
    } catch {
      // Fallback silently
    }

    return {
      username: String(account.username),
      avatarUrl: String(account.avatarUrl ?? 'https://avatars.githubusercontent.com/u/5832347?v=4'),
      publicRepos,
      bio: String(account.displayName ?? 'Connected via GitHub OAuth'),
    };
  } catch {
    return null;
  }
};

export const disconnectGitHub = async (): Promise<void> => {
  await githubApi.disconnect();
};

export const syncRepositories = async (includeForks?: boolean) => {
  const payload = await githubApi.syncRepositories({ sync: true, includeForks });
  return normalizeRepositories(payload);
};

export const fetchCachedRepositories = async () => {
  const payload = await githubApi.getCachedRepositories();
  return normalizeRepositories(payload);
};

export const syncRepositoryPackages = async (repoId: string, cached = false) => {
  const payload = cached
    ? await githubApi.getCachedPackages(repoId)
    : await githubApi.syncPackages(repoId);
  return extractApiResource(payload, ['packages', 'files']);
};

export const syncRepositoryCommits = async (
  repoId: string,
  cached = false,
  params?: { perPage?: number; includeStats?: boolean }
) => {
  const payload = cached
    ? await githubApi.getCachedCommits(repoId)
    : await githubApi.syncCommits(repoId, params);
  return extractApiResource(payload, ['commits']);
};
