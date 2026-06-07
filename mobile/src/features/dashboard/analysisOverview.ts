import type { AnalysisResult } from '../../types';

type CountedItem = {
  label: string;
  count: number;
};

export type RepositoryAnalysisOverview = {
  repositoriesCount: number;
  averageOverallScore: number;
  averageTestingScore: number;
  averageDeploymentScore: number;
  topLanguages: CountedItem[];
  topFrameworks: CountedItem[];
  topCareerDirections: CountedItem[];
  strongestSignals: CountedItem[];
  missingSkills: CountedItem[];
  summary: string;
};

const normalizeLabel = (value: string) => value.trim();

const countItems = (items: string[], limit = 5): CountedItem[] => {
  const counts = new Map<string, number>();

  items.map(normalizeLabel).filter(Boolean).forEach((item) => {
    const key = item.toLowerCase();
    const existing = Array.from(counts.keys()).find((value) => value.toLowerCase() === key);
    counts.set(existing ?? item, (counts.get(existing ?? item) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
};

const average = (values: number[]) => {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (validValues.length === 0) return 0;
  return Math.round(validValues.reduce((sum, value) => sum + value, 0) / validValues.length);
};

export const buildRepositoryAnalysisOverview = (analyses: AnalysisResult[]): RepositoryAnalysisOverview | null => {
  if (analyses.length === 0) return null;

  const topLanguages = countItems(analyses.flatMap((analysis) => analysis.languages ?? []));
  const topFrameworks = countItems(analyses.flatMap((analysis) => analysis.frameworks ?? []));
  const topCareerDirections = countItems(
    analyses.map((analysis) => analysis.careerDirection?.primary).filter(Boolean) as string[]
  );
  const strongestSignals = countItems(analyses.flatMap((analysis) => [
    ...(analysis.skillSignals ?? []),
    ...(analysis.careerSignals ?? []),
  ]));
  const missingSkills = countItems(analyses.flatMap((analysis) => analysis.missingSkills.map((skill) => skill.name)));
  const averageOverallScore = average(analyses.map((analysis) => analysis.scores.overallScore ?? analysis.scores.overall));
  const averageTestingScore = average(analyses.map((analysis) => analysis.scores.testingScore ?? 0));
  const averageDeploymentScore = average(analyses.map((analysis) => analysis.scores.deploymentScore ?? 0));
  const primaryDirection = topCareerDirections[0]?.label ?? 'Software Engineer';
  const mainStrength = strongestSignals[0]?.label ?? topLanguages[0]?.label ?? 'nền tảng dự án GitHub';
  const mainGap = missingSkills[0]?.label;

  return {
    repositoriesCount: analyses.length,
    averageOverallScore,
    averageTestingScore,
    averageDeploymentScore,
    topLanguages,
    topFrameworks,
    topCareerDirections,
    strongestSignals,
    missingSkills,
    summary: mainGap
      ? `Tổng quan ${analyses.length} repo cho thấy hướng nổi bật là ${primaryDirection}, điểm mạnh hiện tại là ${mainStrength}, và kỹ năng nên ưu tiên bổ sung là ${mainGap}.`
      : `Tổng quan ${analyses.length} repo cho thấy hướng nổi bật là ${primaryDirection}, với tín hiệu mạnh nhất là ${mainStrength}.`,
  };
};
