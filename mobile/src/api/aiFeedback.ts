import { apiClient, unwrapResponse } from './client';

export const aiFeedbackApi = {
  async generate(repoId: string) {
    const response = await apiClient.post(`/ai-feedback/repositories/${repoId}`);
    return unwrapResponse(response.data);
  },

  async getResult(repoId: string) {
    const response = await apiClient.get(`/ai-feedback/results/${repoId}`);
    return unwrapResponse(response.data);
  },

  async getMine() {
    const response = await apiClient.get('/ai-feedback/me');
    return unwrapResponse(response.data);
  },
};
