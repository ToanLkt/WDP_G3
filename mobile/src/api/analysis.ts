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

  async getRoleMatches(data: { sourceMode: string; repoId?: string; repoIds?: string[]; limit?: number; view?: string }) {
    const response = await apiClient.post('/analysis/role-matches', data);
    return unwrapResponse(response.data);
  },

  async getRolesCatalog() {
    const response = await apiClient.get('/roles/catalog');
    return unwrapResponse(response.data);
  },

  async getSkillsCatalog() {
    const response = await apiClient.get('/skills/catalog');
    return unwrapResponse(response.data);
  },
};
