import type { AnalysisResult } from '../../types/index';
import { roadmapTargetRoles } from './constants';

type Role = (typeof roadmapTargetRoles)[number];

export type RoadmapRoleRecommendation = {
  role: Role;
  title: string;
  reason: string;
  focus: string;
};

const includesAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const collectAnalysisText = (analyses: AnalysisResult[]) =>
  analyses
    .flatMap((analysis) => [
      analysis.projectType,
      analysis.careerDirection?.primary,
      ...(analysis.careerDirection?.secondary ?? []),
      ...(analysis.languages ?? []),
      ...(analysis.frameworks ?? []),
      ...(analysis.techStack ?? []),
      ...(analysis.skillSignals ?? []),
      ...(analysis.careerSignals ?? []),
      ...analysis.strengths,
      ...analysis.weaknesses,
      ...analysis.missingSkills.map((skill) => skill.name),
    ])
    .join(' ')
    .toLowerCase();

const reasonByRole: Record<Role, string> = {
  'Frontend Developer': 'AI thấy nhiều tín hiệu về giao diện, React hoặc trải nghiệm người dùng trong các repository đã phân tích.',
  'Backend Developer': 'AI thấy nhiều tín hiệu về API, Node.js, Express, MongoDB hoặc xác thực trong các repository đã phân tích.',
  'Fullstack Developer': 'AI thấy bạn có cả tín hiệu frontend và backend, nên hướng Fullstack giúp tận dụng tốt nền tảng hiện có.',
  'Mobile Developer': 'AI thấy tín hiệu liên quan đến mobile hoặc framework mobile trong dữ liệu phân tích.',
  'Tester / QA Engineer': 'AI thấy testing là kỹ năng cần bổ sung hoặc có tín hiệu QA trong repository.',
  'DevOps Beginner': 'AI thấy Docker, triển khai hoặc CI/CD là phần nên ưu tiên để dự án sẵn sàng hơn.',
  'Data Analyst': 'AI thấy tín hiệu về dữ liệu, dashboard, analytics hoặc SQL trong repository.',
  'AI / Machine Learning Beginner': 'AI thấy tín hiệu liên quan đến AI, machine learning, model hoặc LLM.',
};

export const recommendRoadmapRole = (analyses: AnalysisResult[]): RoadmapRoleRecommendation | null => {
  if (analyses.length === 0) return null;

  const text = collectAnalysisText(analyses);
  const scores = new Map<Role, number>(roadmapTargetRoles.map((role) => [role, 0]));
  const add = (role: Role, value: number) => scores.set(role, (scores.get(role) ?? 0) + value);

  if (includesAny(text, ['react', 'vue', 'frontend', 'css', 'html', 'ui', 'web-vitals'])) add('Frontend Developer', 4);
  if (includesAny(text, ['node', 'express', 'mongodb', 'mongoose', 'jwt', 'api', 'backend', 'server'])) add('Backend Developer', 4);
  if (includesAny(text, ['react', 'frontend']) && includesAny(text, ['node', 'express', 'mongodb', 'api', 'backend'])) add('Fullstack Developer', 6);
  if (includesAny(text, ['docker', 'ci/cd', 'deployment', 'github actions', 'devops'])) add('DevOps Beginner', 4);
  if (includesAny(text, ['testing', 'test', 'qa', 'playwright', 'jest'])) add('Tester / QA Engineer', 4);
  if (includesAny(text, ['mobile', 'react native', 'flutter', 'android', 'ios'])) add('Mobile Developer', 5);
  if (includesAny(text, ['data', 'dashboard', 'analytics', 'python', 'pandas', 'sql'])) add('Data Analyst', 4);
  if (includesAny(text, ['ai', 'machine learning', 'ml', 'model', 'gemini', 'llm'])) add('AI / Machine Learning Beginner', 4);

  analyses.forEach((analysis) => {
    const missing = analysis.missingSkills.map((skill) => skill.name.toLowerCase()).join(' ');
    if (includesAny(missing, ['docker', 'deployment', 'ci/cd'])) add('DevOps Beginner', 2);
    if (includesAny(missing, ['testing', 'test'])) add('Tester / QA Engineer', 2);
    if (includesAny(missing, ['backend', 'api', 'node'])) add('Backend Developer', 2);
  });

  const [role, score] = Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];

  if (!role || score <= 0) {
    return {
      role: 'Backend Developer',
      title: 'Đề xuất chính theo repository',
      reason: 'AI chưa thấy tín hiệu đủ rõ, nên chọn Backend Developer làm hướng nền tảng để bạn củng cố API, dữ liệu và cấu trúc hệ thống.',
      focus: 'Nền tảng API, database, xác thực và cấu trúc backend.',
    };
  }

  return {
    role,
    title: 'Đề xuất chính theo repository',
    reason: reasonByRole[role],
    focus: 'Tập trung vào hướng nghề nghiệp nổi bật nhất từ các repository đã phân tích.',
  };
};

export const recommendJobReadinessRoadmaps = (analyses: AnalysisResult[]): RoadmapRoleRecommendation[] => {
  if (analyses.length === 0) return [];

  const text = collectAnalysisText(analyses);
  const suggestions: RoadmapRoleRecommendation[] = [];

  if (includesAny(text, ['testing', 'test', 'automated testing', 'jest', 'vitest', 'playwright', 'cypress'])) {
    suggestions.push({
      role: 'Tester / QA Engineer',
      title: 'Đề xuất phụ: tăng độ tin cậy dự án',
      reason: 'Nhiều repository còn thiếu kiểm thử tự động. Bổ sung testing giúp portfolio đáng tin hơn khi ứng tuyển.',
      focus: 'Unit test, integration test, E2E test và cách trình bày coverage trong README.',
    });
  }

  if (includesAny(text, ['docker', 'deployment', 'ci/cd', 'github actions', 'environment configuration', '.env'])) {
    suggestions.push({
      role: 'DevOps Beginner',
      title: 'Đề xuất phụ: sẵn sàng triển khai',
      reason: 'Các phân tích cho thấy Docker, CI/CD hoặc cấu hình môi trường là điểm nên cải thiện để dự án dễ chạy và dễ demo.',
      focus: 'Dockerfile, docker-compose, GitHub Actions, biến môi trường và hướng dẫn deploy.',
    });
  }

  if (suggestions.length < 2 && includesAny(text, ['react', 'frontend', 'express', 'backend', 'api'])) {
    suggestions.push({
      role: 'Fullstack Developer',
      title: 'Đề xuất phụ: hoàn thiện sản phẩm demo',
      reason: 'Bạn có tín hiệu cả frontend hoặc backend. Một roadmap Fullstack phụ giúp biến repo thành sản phẩm demo hoàn chỉnh hơn.',
      focus: 'Kết nối frontend-backend, auth flow, CRUD, deploy demo và README theo hướng portfolio.',
    });
  }

  if (suggestions.length < 2) {
    suggestions.push({
      role: 'Backend Developer',
      title: 'Đề xuất phụ: củng cố nền tảng kỹ thuật',
      reason: 'Backend là nền tảng tốt để chứng minh năng lực API, dữ liệu, xác thực và cấu trúc hệ thống khi ứng tuyển.',
      focus: 'REST API, database, validation, authentication và tài liệu kỹ thuật.',
    });
  }

  return suggestions.slice(0, 2);
};
