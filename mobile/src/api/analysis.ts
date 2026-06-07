import { apiClient, encodeRepoId, unwrapResponse } from './client';

export const analysisApi = {
  async analyzeRepository(repoId: string) {
    const response = await apiClient.post(`/analysis/repositories/${encodeRepoId(repoId)}`);
    return unwrapResponse(response.data);
  },

  async getResult(repoId: string) {
    const response = await apiClient.get(`/analysis/results/${encodeRepoId(repoId)}`);
    return unwrapResponse(response.data);
  },

  async getMine() {
    const response = await apiClient.get('/analysis/me');
    return unwrapResponse(response.data);
  },
};
