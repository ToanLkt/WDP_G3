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

const OAUTH_POLL_INTERVAL_MS = 2000;
const OAUTH_TIMEOUT_MS = 120_000;

const resolveOAuthUrl = (payload: Record<string, string | undefined>) => {
  return payload.authorizeUrl
    ?? payload.authorizationUrl
    ?? payload.oauthUrl
    ?? payload.connectUrl
    ?? payload.url;
};

export const fetchOAuthUrl = async (forceAccountSelection?: boolean): Promise<string> => {
  const payload = await githubApi.getOAuthUrl('mobile', forceAccountSelection);
  const authorizeUrl = resolveOAuthUrl(payload as Record<string, string | undefined>);

  if (!authorizeUrl) {
    throw new Error('Backend did not return a valid authorizeUrl.');
  }

  return authorizeUrl;
};

const parseGitHubAccount = (payload: unknown) => {
  return extractApiResource<Record<string, unknown>>(payload, ['githubAccount', 'github', 'account', 'user']);
};

export const fetchGitHubAccount = async () => {
  const payload = await githubApi.getAccount();
  return parseGitHubAccount(payload);
};

/** Lightweight check — GET /github/me only (used during OAuth polling) */
export const checkGitHubConnected = async (): Promise<boolean> => {
  try {
    const payload = await githubApi.me();
    const account = parseGitHubAccount(payload);
    return Boolean(account?.username);
  } catch {
    return false;
  }
};

const dismissAuthBrowser = async () => {
  try {
    await WebBrowser.dismissBrowser();
  } catch {
    // Browser may already be closed
  }
  WebBrowser.maybeCompleteAuthSession();
};

/**
 * Mobile-only OAuth completion: poll /github/me while the browser session is open,
 * then dismiss the browser when the deployed callback finishes linking the account.
 */
export const connectGitHubOAuth = async (forceAccountSelection?: boolean): Promise<GitHubOAuthResult> => {
  const authorizeUrl = await fetchOAuthUrl(forceAccountSelection);
  const callbackUrl = getOAuthCallbackUrl();

  WebBrowser.maybeCompleteAuthSession();

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const authSessionPromise = WebBrowser.openAuthSessionAsync(authorizeUrl, callbackUrl);

  const pollPromise = new Promise<'success'>((resolve, reject) => {
    pollInterval = setInterval(async () => {
      try {
        if (await checkGitHubConnected()) {
          stopPolling();
          await dismissAuthBrowser();
          resolve('success');
        }
      } catch {
        // Keep polling
      }
    }, OAUTH_POLL_INTERVAL_MS);

    timeoutId = setTimeout(() => {
      stopPolling();
      reject(new Error('GitHub OAuth timed out. Please try again.'));
    }, OAUTH_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      authSessionPromise.then(async (session): Promise<GitHubOAuthResult> => {
        stopPolling();
        await dismissAuthBrowser();

        if (session.type === 'success' || await checkGitHubConnected()) {
          return 'success';
        }

        if (session.type === 'cancel') {
          return 'cancelled';
        }

        return 'dismissed';
      }),
      pollPromise,
    ]);

    return result;
  } finally {
    stopPolling();
    await dismissAuthBrowser();
  }
};

export const getGitHubOAuthSetupHint = () => {
  const callbackUrl = getOAuthCallbackUrl();
  return `GitHub OAuth callback URL: ${callbackUrl}`;
};

/** GET /github/me + cached repo count */
export const fetchGitHubMe = async (): Promise<GitHubUser | null> => {
  try {
    const payload = await githubApi.me();
    const account = parseGitHubAccount(payload);

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

export const disconnectGitHub = async (): Promise<any> => {
  return await githubApi.disconnect();
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
