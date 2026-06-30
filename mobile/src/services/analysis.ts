import { analysisApi } from '../api/analysis';
import { extractApiResource } from '../api/client';
import { normalizeAnalysis, normalizeAnalyses } from '../api/normalizers';
import type { AnalysisResult } from '../types';

/** GET /analysis/results/{repoId} — read latest snapshot (no GitHub sync) */
export const fetchAnalysisResult = async (repoId: string): Promise<AnalysisResult> => {
  const payload = await analysisApi.getResult(repoId);
  const analysisPayload = extractApiResource(payload, ['analysis', 'result', 'snapshot']);
  const analysis = normalizeAnalysis(analysisPayload);

  if (!analysis.id && !analysis.repositoryId) {
    throw new Error('Codebase diagnostics data has not been generated for this repository yet.');
  }

  return analysis as AnalysisResult;
};

export const fetchMyAnalyses = async () => {
  const payload = await analysisApi.getMine();
  const list = extractApiResource<unknown>(payload, ['analyses', 'results', 'items', 'snapshots']);
  return normalizeAnalyses(Array.isArray(list) ? list : payload);
};
