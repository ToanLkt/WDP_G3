import { apiClient, unwrapResponse } from './client';

export const chatApi = {
  async createSession(title: string, context?: { repositoryId?: string }) {
    const response = await apiClient.post('/chat/sessions', {
      title,
      ...context,
    });
    return unwrapResponse(response.data);
  },

  async getSessions() {
    const response = await apiClient.get('/chat/sessions');
    return unwrapResponse(response.data);
  },

  async getSession(sessionId: string) {
    const response = await apiClient.get(`/chat/sessions/${sessionId}`);
    return unwrapResponse(response.data);
  },

  async sendMessage(sessionId: string, message: string) {
    const response = await apiClient.post(`/chat/sessions/${sessionId}/messages`, { message });
    return unwrapResponse(response.data);
  },

  async deleteSession(sessionId: string) {
    const response = await apiClient.delete(`/chat/sessions/${sessionId}`);
    return unwrapResponse(response.data);
  },
};
