import { apiClient, unwrapResponse } from './client';

export const dashboardApi = {
  async me() {
    const response = await apiClient.get('/dashboard/me');
    return unwrapResponse(response.data);
  },
};
