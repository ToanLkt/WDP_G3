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

export interface RoleMatchesResponse {
  sourceMode: string;
  analysisSource?: {
    type?: string;
    sourceMode?: string;
    totalRepositories?: number;
    totalUserCommits?: number;
    userLevel?: string;
    userReadinessScore?: number;
    repositoryNames?: string[];
  };
  matches: Array<{
    roleId: string;
    roleName: string;
    matchScore: number;
    matchLevel: string;
    matchLevelLabel: string;
    matchedSkillNames?: string[];
    weakSkillNames?: string[];
    missingSkillNames?: string[];
    recommendedNextSkills?: string[];
  }>;
}

export const fetchRoleMatches = async (params: {
  sourceMode: 'single_repo' | 'all_analyzed_repos' | 'selected_repos' | string;
  repoId?: string;
  repoIds?: string[];
  limit?: number;
  view?: 'summary' | 'detail' | string;
}): Promise<RoleMatchesResponse> => {
  const payload = await analysisApi.getRoleMatches(params);
  return extractApiResource<RoleMatchesResponse>(payload);
};

export const fetchRoleCatalog = async () => {
  const payload = await analysisApi.getRolesCatalog();
  return extractApiResource<any>(payload, ['roles']);
};

export const fetchSkillCatalog = async () => {
  const payload = await analysisApi.getSkillsCatalog();
  return extractApiResource<any>(payload, ['skills']);
};
