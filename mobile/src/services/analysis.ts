import { analysisApi } from '../api/analysis';
import { extractApiResource } from '../api/client';
import { normalizeAnalysis, normalizeAnalyses } from '../api/normalizers';

export interface PackageInfo {
  name: string;
  version: string;
  status: 'production' | 'development' | 'outdated';
}

export interface Recommendation {
  id: string;
  skill: string;
  reason: string;
  action: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

export interface AnalysisResult {
  repoId: string;
  project_type: string;
  tech_stack: string[];
  readme_summary: string;
  package_info: PackageInfo[];
  commit_summary: string;
  missing_items: string[];
  recommendations: Recommendation[];
}

const mapRecommendation = (rec: { title: string; description: string }, index: number): Recommendation => {
  const text = rec.description || rec.title;
  let skill = 'Kỹ năng khuyến nghị';
  let reason = 'Được đề xuất dựa trên phân tích mã nguồn của bạn.';
  let action = text;
  let difficulty: Recommendation['difficulty'] = 'Intermediate';

  const lower = text.toLowerCase();
  if (lower.includes('readme') || lower.includes('tài liệu')) {
    skill = 'Documentation & Portfolio';
    reason = 'Tài liệu hướng dẫn rõ ràng giúp người khác dễ dàng chạy thử và đánh giá cao dự án của bạn.';
    difficulty = 'Beginner';
  } else if (lower.includes('test') || lower.includes('kiểm thử') || lower.includes('jest')) {
    skill = 'Automated Testing';
    reason = 'Viết unit tests đảm bảo code chạy ổn định và chứng minh tư duy phát triển phần mềm chuẩn mực.';
    difficulty = 'Intermediate';
  } else if (lower.includes('docker') || lower.includes('compose')) {
    skill = 'Containerization (Docker)';
    reason = 'Docker giúp đóng gói và chạy ứng dụng đồng nhất trên mọi môi trường từ local lên cloud.';
    difficulty = 'Intermediate';
  } else if (lower.includes('ci/cd') || lower.includes('workflow') || lower.includes('pipeline') || lower.includes('action')) {
    skill = 'CI/CD Automation';
    reason = 'Tự động kiểm tra chất lượng code và triển khai sản phẩm giúp rút ngắn chu kỳ phát triển.';
    difficulty = 'Advanced';
  } else if (lower.includes('env') || lower.includes('môi trường') || lower.includes('biến')) {
    skill = 'Secure Environment Config';
    reason = 'Quản lý biến môi trường an toàn giúp tránh lộ lọt API keys và secrets lên GitHub public.';
    difficulty = 'Beginner';
  }

  return {
    id: `rec_${index}`,
    skill,
    reason,
    action,
    difficulty,
  };
};

const toMobileAnalysis = (analysis: ReturnType<typeof normalizeAnalysis>, repoId: string): AnalysisResult => {
  const techStack = [...(analysis.languages || []), ...(analysis.frameworks || []), ...analysis.techStack];
  const packageInfo: PackageInfo[] = (analysis.packages || []).map((pkg) => ({
    name: pkg,
    version: 'Lần phân tích cuối',
    status: 'production' as const,
  }));

  const cs = analysis.commitSummary;
  const commitSummary = cs?.totalCommits
    ? `Dự án có tổng cộng ${cs.totalCommits} commits trên ${cs.activeDays || 0} ngày hoạt động. Tỷ lệ commit mơ hồ là ${((cs.vagueCommitRatio || 0) * 100).toFixed(0)}%, tỷ lệ conventional commit đạt ${((cs.conventionalCommitRatio || 0) * 100).toFixed(0)}%.`
    : 'Lịch sử commit chưa được ghi nhận hoặc không có dữ liệu.';

  const readmeSummary = analysis.checklist?.hasReadme
    ? 'README.md được tìm thấy tại thư mục gốc của repository và đã được hệ thống phân tích thành công.'
    : 'Repository này chưa có tệp README.md ở thư mục gốc hoặc tệp trống. Hãy thêm README.md mô tả dự án để nâng cao điểm đánh giá.';

  const missingItems = [
    ...analysis.weaknesses,
    ...analysis.missingSkills.map((skill) => skill.name),
  ];

  const recommendations = analysis.recommendations.map((rec, idx) => mapRecommendation(rec, idx));

  return {
    repoId,
    project_type: analysis.projectType || 'Software Repository',
    tech_stack: techStack.length > 0 ? techStack : ['Unknown'],
    readme_summary: readmeSummary,
    package_info: packageInfo,
    commit_summary: commitSummary,
    missing_items: missingItems,
    recommendations,
  };
};

/** GET /analysis/results/{repoId} — read latest snapshot (no GitHub sync) */
export const fetchAnalysisResult = async (repoId: string): Promise<AnalysisResult> => {
  const payload = await analysisApi.getResult(repoId);
  const analysisPayload = extractApiResource(payload, ['analysis', 'result', 'snapshot']);
  const analysis = normalizeAnalysis(analysisPayload);

  if (!analysis.id && !analysis.repositoryId) {
    throw new Error('Codebase diagnostics data has not been generated for this repository yet.');
  }

  return toMobileAnalysis(analysis, repoId);
};

export const fetchMyAnalyses = async () => {
  const payload = await analysisApi.getMine();
  const list = extractApiResource<unknown>(payload, ['analyses', 'results', 'items', 'snapshots']);
  return normalizeAnalyses(Array.isArray(list) ? list : payload);
};
