import { apiClient, encodeRepoId, unwrapResponse } from './client';

export const githubApi = {
  async getOAuthUrl(platform: 'mobile' | 'web' = 'mobile', forceAccountSelection?: boolean) {
    const response = await apiClient.get('/github/oauth', { params: { platform, forceAccountSelection } });
    return unwrapResponse<{
      authorizeUrl?: string;
      authorizationUrl?: string;
      oauthUrl?: string;
      connectUrl?: string;
      url?: string;
    }>(response.data);
  },

  async me() {
    const response = await apiClient.get('/github/me');
    return unwrapResponse(response.data);
  },

  async disconnect() {
    const response = await apiClient.delete('/github/disconnect');
    return unwrapResponse(response.data);
  },

  async syncRepositories(params?: { includeForks?: boolean; sync?: boolean }) {
    const response = await apiClient.get('/github/repositories', { params });
    return unwrapResponse(response.data);
  },

  async getCachedRepositories() {
    const response = await apiClient.get('/github/repositories/cached');
    return unwrapResponse(response.data);
  },

  async getRepository(repoId: string) {
    const response = await apiClient.get(`/github/repositories/${encodeRepoId(repoId)}`);
    return unwrapResponse(response.data);
  },

  async syncPackages(repoId: string) {
    const response = await apiClient.get(`/github/repositories/${encodeRepoId(repoId)}/packages`);
    return unwrapResponse(response.data);
  },

  async getCachedPackages(repoId: string) {
    const response = await apiClient.get(`/github/repositories/${encodeRepoId(repoId)}/packages/cached`);
    return unwrapResponse(response.data);
  },

  async syncCommits(repoId: string, params?: { perPage?: number; includeStats?: boolean }) {
    const response = await apiClient.get(`/github/repositories/${encodeRepoId(repoId)}/commits`, { params });
    return unwrapResponse(response.data);
  },

  async getCachedCommits(repoId: string) {
    const response = await apiClient.get(`/github/repositories/${encodeRepoId(repoId)}/commits/cached`);
    return unwrapResponse(response.data);
  },
};
