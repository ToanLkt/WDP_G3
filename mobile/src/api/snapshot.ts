import { apiClient, encodeRepoId, unwrapResponse } from './client';
import type { AnalysisSnapshot, SnapshotComparison } from '../types';

export type SnapshotQueryParams = {
  includeEvidence?: boolean;
  includeSkillDetails?: boolean;
};

export const snapshotApi = {
  /** GET /repositories/:repoId/snapshots — danh sách mốc snapshot */
  async getSnapshots(repositoryId: string): Promise<AnalysisSnapshot[]> {
    const response = await apiClient.get<unknown>(
      `/repositories/${encodeRepoId(repositoryId)}/snapshots`,
    );
    const data = unwrapResponse<any>(response.data);
    const list = Array.isArray(data?.snapshots)
      ? data.snapshots
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
      ? data
      : [];
    return list;
  },

  /** GET /snapshots/:snapshotId — chi tiết 1 snapshot */
  async getSnapshot(
    snapshotId: string,
    params: SnapshotQueryParams = { includeEvidence: true },
  ): Promise<AnalysisSnapshot> {
    const response = await apiClient.get<unknown>(`/snapshots/${snapshotId}`, {
      params: params as Record<string, unknown>,
    });
    return unwrapResponse<AnalysisSnapshot>(response.data);
  },

  /**
   * POST /snapshots/compare — so sánh 2 snapshot tuỳ chọn.
   * `apiClient.post` nhận (path, body) – params phải nhúng vào body hoặc query string thủ công.
   */
  async compareSnapshots(
    fromSnapshotId: string,
    toSnapshotId: string,
  ): Promise<SnapshotComparison> {
    const response = await apiClient.post<unknown>('/snapshots/compare', {
      fromSnapshotId,
      toSnapshotId,
    });
    return unwrapResponse<SnapshotComparison>(response.data);
  },

  /**
   * GET /repositories/:repoId/progress-comparison — so sánh tự động
   * (snapshot đầu tiên vs mới nhất của repo).
   */
  async getProgressComparison(
    repositoryId: string,
    params: SnapshotQueryParams = { includeSkillDetails: true },
  ): Promise<SnapshotComparison> {
    const response = await apiClient.get<unknown>(
      `/repositories/${encodeRepoId(repositoryId)}/progress-comparison`,
      { params: params as Record<string, unknown> },
    );
    return unwrapResponse<SnapshotComparison>(response.data);
  },
};
