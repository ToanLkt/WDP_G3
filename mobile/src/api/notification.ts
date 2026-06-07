import { apiClient, unwrapResponse } from './client';

export type NotificationQuery = {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
  type?: string;
};

export type NotificationPayload = {
  title: string;
  message: string;
  type: 'GITHUB_ANALYSIS_REMINDER' | 'ROADMAP_TASK_REMINDER' | 'REPOSITORY_IMPROVEMENT' | 'SYSTEM';
  scheduledAt?: string;
  metadata?: Record<string, unknown>;
};

export const notificationApi = {
  async getMine(params?: NotificationQuery) {
    const response = await apiClient.get('/notifications/me', { params });
    return unwrapResponse(response.data);
  },

  async create(payload: NotificationPayload) {
    const response = await apiClient.post('/notifications', payload);
    return unwrapResponse(response.data);
  },

  async markAsRead(notificationId: string) {
    const response = await apiClient.patch(`/notifications/${notificationId}/read`);
    return unwrapResponse(response.data);
  },

  async remove(notificationId: string) {
    const response = await apiClient.delete(`/notifications/${notificationId}`);
    return unwrapResponse(response.data);
  },
};
