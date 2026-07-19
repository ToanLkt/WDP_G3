import { apiClient, unwrapResponse } from './client';
import { normalizeFeedback, normalizeFeedbackList } from './normalizers';

export const aiFeedbackApi = {
  async generate(repoId: string) {
    const response = await apiClient.post(`/ai-feedback/repositories/${repoId}`);
    return normalizeFeedback(unwrapResponse(response.data));
  },

  async getResult(repoId: string) {
    const response = await apiClient.get(`/ai-feedback/results/${repoId}`);
    return normalizeFeedback(unwrapResponse(response.data));
  },

  async getMine() {
    const response = await apiClient.get('/ai-feedback/me');
    return normalizeFeedbackList(unwrapResponse(response.data));
  },
};
