import { apiClient, extractApiResource } from './client';

export type ReportTargetType = 'repository';

export interface CreateReportPayload {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  description: string;
}

export interface Report {
  id?: string;
  reporterId?: string;
  targetType?: ReportTargetType;
  targetId?: string;
  reason?: string;
  description?: string;
  status?: string;
  createdAt?: string;
}

export const reportApi = {
  async createReport(payload: CreateReportPayload) {
    const response = await apiClient.post('/reports', payload);
    return extractApiResource<Report>(response.data, ['report']);
  },
};
