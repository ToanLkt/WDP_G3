import { snapshotApi } from '../api/snapshot';
import type { AnalysisSnapshot, SnapshotComparison, SnapshotScoreChange, SnapshotDelta } from '../types';

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

/** Pick first number that is finite, skip null/undefined/NaN */
function asNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Get a score from source with multiple key fallbacks, then inside sub-objects */
function getScore(source: Record<string, unknown>, ...keys: string[]): number {
  const scores = (source.scores ?? source.score) as Record<string, unknown> | undefined;
  for (const key of keys) {
    if (source[key] !== undefined) return asNum(source[key]);
    if (scores && scores[key] !== undefined) return asNum(scores[key]);
  }
  return 0;
}

/** Đảm bảo snapshot có đủ các trường cần thiết với giá trị mặc định an toàn */
export function normalizeSnapshot(raw: unknown): AnalysisSnapshot {
  const sourcePayload = (raw ?? {}) as Record<string, unknown>;
  // API may wrap the snapshot inside a `snapshot` key
  const source = ((sourcePayload.snapshot ?? raw) ?? {}) as Record<string, unknown>;
  const repository = (source.repository ?? {}) as Record<string, unknown>;
  const analysisScope = (source.analysisScope ?? {}) as Record<string, unknown>;
  const summary = (source.summary ?? {}) as Record<string, unknown>;

  return {
    // ID: API may use snapshotId, id, _id, or analysisSnapshotId
    id: String(source.snapshotId ?? source.id ?? source._id ?? source.analysisSnapshotId ?? ''),
    repositoryId: String(
      source.repositoryId ?? source.repoId ??
      repository.repositoryId ?? repository.id ?? repository._id ?? ''
    ),
    repoName: (source.repoName ?? repository.repoName ?? repository.name) as string | undefined,
    fullName: (source.fullName ?? repository.fullName) as string | undefined,
    analysisId: source.analysisId as string | undefined,
    analysisScope: Object.keys(analysisScope).length ? {
      type: analysisScope.type as string | undefined,
      githubUsername: analysisScope.githubUsername as string | undefined,
      totalRepoCommits: analysisScope.totalRepoCommits as number | undefined,
      userCommits: analysisScope.userCommits as number | undefined,
      activeDays: analysisScope.activeDays as number | undefined,
      firstCommitDate: analysisScope.firstCommitDate as string | undefined,
      lastCommitDate: analysisScope.lastCommitDate as string | undefined,
    } : undefined,
    createdAt: String(source.createdAt ?? source.analyzedAt ?? source.timestamp ?? source.generatedAt ?? new Date().toISOString()),
    analyzedAt: source.analyzedAt as string | undefined,
    userLevel: (source.userLevel ?? summary.userLevel) as string | undefined,
    projectType: (source.projectType ?? summary.projectType) as string | undefined,
    confidence: (source.confidence ?? summary.confidence) as string | number | undefined,
    careerDirection: (source.careerDirection ?? summary.careerDirection) as string | undefined,
    pipelineVersion: source.pipelineVersion as string | undefined,
    modelVersion: source.modelVersion as string | undefined,
    scoringMethod: (source.scoringMethod ?? summary.scoringMethod) as string | undefined,
    missingSkills: Array.isArray(source.missingSkills)
      ? source.missingSkills.map((skill: unknown) => {
          if (typeof skill === 'string') return skill;
          if (skill && typeof skill === 'object') {
            const sk = skill as Record<string, unknown>;
            const name = sk.skillName ?? sk.canonicalSkillName ?? sk.name ?? sk.normalizedSkillName ?? sk.title ?? sk.label;
            if (name && typeof name === 'string') return name;
            if (name) return String(name);
          }
          return String(skill ?? '');
        }).filter(Boolean)
      : [],
    topSkills: Array.isArray(source.topSkills) ? (source.topSkills as AnalysisSnapshot['topSkills']) : [],
    skillVector: Array.isArray(source.skillVector) ? (source.skillVector as AnalysisSnapshot['skillVector']) : [],
    skillVectorSummary: source.skillVectorSummary as AnalysisSnapshot['skillVectorSummary'],
    // Score: try overallScore, overall, userReadinessScore (the API may use any of these)
    overallScore: getScore(source, 'overallScore', 'overall', 'userReadinessScore') || asNum(summary.userReadinessScore),
    techStackScore: getScore(source, 'techStackScore') || undefined,
    documentationScore: getScore(source, 'documentationScore', 'documentation') || undefined,
    commitQualityScore: getScore(source, 'commitQualityScore', 'commitQuality') || undefined,
    testingScore: getScore(source, 'testingScore') || undefined,
    deploymentScore: getScore(source, 'deploymentScore') || undefined,
    portfolioReadinessScore: getScore(source, 'portfolioReadinessScore') || undefined,
  };
}

/** Đảm bảo SnapshotComparison có đủ các mảng cần thiết */
export function normalizeComparison(raw: unknown): SnapshotComparison {
  const c = (raw ?? {}) as Record<string, unknown>;

  // Score changes array for fallback score extraction
  const scoreChanges: SnapshotScoreChange[] = Array.isArray(c.scoreChanges)
    ? (c.scoreChanges as any[]).map((item: any) => ({
        key: String(item.key ?? ''),
        label: String(item.label ?? item.key ?? ''),
        before: typeof item.before === 'number' ? item.before : 0,
        after: typeof item.after === 'number' ? item.after : 0,
        change: typeof item.change === 'number' ? item.change : 0,
        status: String(item.status ?? 'unchanged'),
      }))
    : [];
  const scoreValue = (key: string, side: 'before' | 'after') =>
    scoreChanges.find((item) => item.key === key)?.[side] ?? 0;

  // Try all possible aliases for firstSnapshot (the "from" / "base" snapshot)
  const firstRaw =
    c.firstSnapshot ?? c.baseSnapshot ?? c.beforeSnapshot ??
    c.oldSnapshot ?? c.fromSnapshot ?? null;

  const firstSnapshot: SnapshotComparison['firstSnapshot'] = firstRaw
    ? normalizeSnapshot(firstRaw)
    : c.fromSnapshotId
    ? {
        id: String(c.fromSnapshotId),
        repositoryId: String(c.repositoryId ?? ''),
        createdAt: String(c.fromDate ?? ''),
        missingSkills: [],
        overallScore: typeof c.overallBefore === 'number' ? c.overallBefore
          : typeof c.fromUserReadinessScore === 'number' ? c.fromUserReadinessScore : 0,
        techStackScore: scoreValue('techStackScore', 'before') || undefined,
        documentationScore: scoreValue('documentationScore', 'before') || undefined,
        commitQualityScore: scoreValue('commitQualityScore', 'before') || undefined,
        deploymentScore: scoreValue('deploymentScore', 'before') || undefined,
        testingScore: scoreValue('testingScore', 'before') || undefined,
        portfolioReadinessScore: scoreValue('portfolioReadinessScore', 'before') || undefined,
      }
    : null;

  // Try all possible aliases for latestSnapshot (the "to" / "current" snapshot)
  const latestRaw =
    c.latestSnapshot ?? c.currentSnapshot ?? c.afterSnapshot ??
    c.newSnapshot ?? c.toSnapshot ?? null;

  const latestSnapshot: SnapshotComparison['latestSnapshot'] = latestRaw
    ? normalizeSnapshot(latestRaw)
    : c.toSnapshotId
    ? {
        id: String(c.toSnapshotId),
        repositoryId: String(c.repositoryId ?? ''),
        createdAt: String(c.toDate ?? ''),
        missingSkills: [],
        overallScore: typeof c.overallAfter === 'number' ? c.overallAfter
          : typeof c.toUserReadinessScore === 'number' ? c.toUserReadinessScore : 0,
        techStackScore: scoreValue('techStackScore', 'after') || undefined,
        documentationScore: scoreValue('documentationScore', 'after') || undefined,
        commitQualityScore: scoreValue('commitQualityScore', 'after') || undefined,
        deploymentScore: scoreValue('deploymentScore', 'after') || undefined,
        testingScore: scoreValue('testingScore', 'after') || undefined,
        portfolioReadinessScore: scoreValue('portfolioReadinessScore', 'after') || undefined,
      }
    : null;

  const delta = (c.delta ?? {}) as Record<string, unknown>;
  const explicitChange = delta.userReadinessScore ?? c.overallChange ?? c.overallScoreChange;
  const overallChange =
    explicitChange !== undefined
      ? Number(explicitChange)
      : (latestSnapshot?.overallScore ?? 0) - (firstSnapshot?.overallScore ?? 0);

  return {
    comparisonStatus: c.comparisonStatus as string | undefined,
    repositoryId: c.repositoryId as string | undefined,
    repoName: c.repoName as string | undefined,
    fullName: c.fullName as string | undefined,
    analysisScopeType: c.analysisScopeType as string | undefined,
    enoughData: typeof c.enoughData === 'boolean' ? c.enoughData : true,
    firstSnapshot,
    latestSnapshot,
    delta: Object.keys(delta).length
      ? ({
          userReadinessScore: typeof delta.userReadinessScore === 'number' ? delta.userReadinessScore : 0,
          levelChanged: Boolean(delta.levelChanged),
          fromLevel: delta.fromLevel as string | undefined,
          toLevel: delta.toLevel as string | undefined,
          userCommitsDelta: delta.userCommitsDelta as number | undefined,
          activeDaysDelta: delta.activeDaysDelta as number | undefined,
        } as SnapshotDelta)
      : undefined,
    skillChanges: Array.isArray(c.skillChanges)
      ? (c.skillChanges as SnapshotComparison['skillChanges'])
      : [],
    overallChange,
    scoreChanges,
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
