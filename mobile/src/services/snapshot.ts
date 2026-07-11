import { snapshotApi } from '../api/snapshot';
import type { AnalysisSnapshot, SnapshotComparison, SnapshotScoreChange } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract skill name from either a string or an object with various name fields */
function extractSkillName(skill: unknown): string {
  if (typeof skill === 'string') return skill;
  if (skill && typeof skill === 'object') {
    const s = skill as Record<string, unknown>;
    const name = s.name ?? s.skillName ?? s.skill ?? s.canonicalSkillName ?? s.normalizedSkillName ?? s.title ?? s.label;
    if (name && typeof name === 'string') return name;
    if (name) return String(name);
  }
  return String(skill ?? '');
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

/** Đảm bảo snapshot có đủ các trường cần thiết với giá trị mặc định an toàn */
export function normalizeSnapshot(raw: unknown): AnalysisSnapshot {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(s.id ?? s._id ?? ''),
    repositoryId: String(s.repositoryId ?? s.repository_id ?? ''),
    repoName: s.repoName as string | undefined,
    fullName: s.fullName as string | undefined,
    analysisId: s.analysisId as string | undefined,
    analysisScope: s.analysisScope as AnalysisSnapshot['analysisScope'],
    createdAt: String(s.createdAt ?? new Date().toISOString()),
    analyzedAt: s.analyzedAt as string | undefined,
    userLevel: s.userLevel as string | undefined,
    projectType: s.projectType as string | undefined,
    confidence: s.confidence as string | number | undefined,
    careerDirection: s.careerDirection as string | undefined,
    missingSkills: Array.isArray(s.missingSkills)
      ? s.missingSkills.map((skill: unknown) => {
          if (typeof skill === 'string') return skill;
          if (skill && typeof skill === 'object') {
            const sk = skill as Record<string, unknown>;
            const name = sk.name ?? sk.skillName ?? sk.skill ?? sk.canonicalSkillName ?? sk.normalizedSkillName ?? sk.title ?? sk.label;
            if (name && typeof name === 'string') return name;
            if (name) return String(name);
          }
          return String(skill ?? '');
        }).filter(Boolean)
      : [],
    topSkills: Array.isArray(s.topSkills) ? (s.topSkills as AnalysisSnapshot['topSkills']) : [],
    skillVector: Array.isArray(s.skillVector)
      ? (s.skillVector as AnalysisSnapshot['skillVector'])
      : [],
    skillVectorSummary: s.skillVectorSummary as AnalysisSnapshot['skillVectorSummary'],
    overallScore: typeof s.overallScore === 'number' ? s.overallScore : 0,
    techStackScore: s.techStackScore as number | undefined,
    documentationScore: s.documentationScore as number | undefined,
    commitQualityScore: s.commitQualityScore as number | undefined,
    testingScore: s.testingScore as number | undefined,
    deploymentScore: s.deploymentScore as number | undefined,
    portfolioReadinessScore: s.portfolioReadinessScore as number | undefined,
  };
}

/** Đảm bảo SnapshotComparison có đủ các mảng cần thiết */
export function normalizeComparison(raw: unknown): SnapshotComparison {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    repositoryId: c.repositoryId as string | undefined,
    repoName: c.repoName as string | undefined,
    fullName: c.fullName as string | undefined,
    analysisScopeType: c.analysisScopeType as string | undefined,
    enoughData: typeof c.enoughData === 'boolean' ? c.enoughData : true,
    firstSnapshot: c.firstSnapshot ? normalizeSnapshot(c.firstSnapshot) : null,
    latestSnapshot: c.latestSnapshot ? normalizeSnapshot(c.latestSnapshot) : null,
    delta: c.delta as SnapshotComparison['delta'],
    skillChanges: Array.isArray(c.skillChanges)
      ? (c.skillChanges as SnapshotComparison['skillChanges'])
      : [],
    overallChange: typeof c.overallChange === 'number' ? c.overallChange : 0,
    scoreChanges: Array.isArray(c.scoreChanges)
      ? (c.scoreChanges as SnapshotScoreChange[])
      : [],
    summary: String(c.summary ?? ''),
    improvements: Array.isArray(c.improvements)
      ? (c.improvements as SnapshotScoreChange[])
      : [],
    regressions: Array.isArray(c.regressions)
      ? (c.regressions as SnapshotScoreChange[])
      : [],
    improvedChecklist: c.improvedChecklist as string[] | undefined,
    regressedChecklist: c.regressedChecklist as string[] | undefined,
    stillMissingChecklist: c.stillMissingChecklist as string[] | undefined,
    alreadyPresentChecklist: c.alreadyPresentChecklist as string[] | undefined,
    remainingMissingSkills: Array.isArray(c.remainingMissingSkills)
      ? c.remainingMissingSkills.map(extractSkillName).filter(Boolean)
      : [],
    resolvedMissingSkills: Array.isArray(c.resolvedMissingSkills)
      ? c.resolvedMissingSkills.map(extractSkillName).filter(Boolean)
      : [],
    newMissingSkills: Array.isArray(c.newMissingSkills)
      ? c.newMissingSkills.map(extractSkillName).filter(Boolean)
      : [],
    topImprovedSkills: Array.isArray(c.topImprovedSkills)
      ? (c.topImprovedSkills as SnapshotComparison['topImprovedSkills'])
      : [],
    topRegressedSkills: Array.isArray(c.topRegressedSkills)
      ? (c.topRegressedSkills as SnapshotComparison['topRegressedSkills'])
      : [],
    newSkills: Array.isArray(c.newSkills)
      ? (c.newSkills as SnapshotComparison['newSkills'])
      : [],
    skillComparisonSummary: (c.skillComparisonSummary ?? {
      totalComparedSkills: 0,
      improvedCount: 0,
      regressedCount: 0,
      unchangedCount: 0,
      newSkillCount: 0,
      resolvedMissingCount: 0,
      remainingMissingCount: 0,
      newMissingCount: 0,
      averageBeforeScore: 0,
      averageAfterScore: 0,
      averageChange: 0,
    }) as SnapshotComparison['skillComparisonSummary'],
    skillComparisonText: String(c.skillComparisonText ?? ''),
    raw: c,
  };
}

// ─── Service functions ─────────────────────────────────────────────────────────

export async function fetchSnapshots(repositoryId: string): Promise<AnalysisSnapshot[]> {
  const list = await snapshotApi.getSnapshots(repositoryId);
  return list.map(normalizeSnapshot);
}

export async function fetchProgressComparison(
  repositoryId: string,
): Promise<SnapshotComparison> {
  const raw = await snapshotApi.getProgressComparison(repositoryId);
  return normalizeComparison(raw);
}

export async function fetchCompareSnapshots(
  fromSnapshotId: string,
  toSnapshotId: string,
): Promise<SnapshotComparison> {
  const raw = await snapshotApi.compareSnapshots(fromSnapshotId, toSnapshotId);
  return normalizeComparison(raw);
}
