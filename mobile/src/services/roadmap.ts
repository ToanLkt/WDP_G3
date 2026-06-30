import { aiFeedbackApi } from '../api/aiFeedback';
import { extractApiResource } from '../api/client';
import { roadmapService } from '../features/roadmaps/api';
import type { Roadmap as WebRoadmap } from '../features/roadmaps/types';

export interface RoadmapStep {
  id: string;
  title: string;
  description: string;
  duration: string;
  status: 'locked' | 'in_progress' | 'completed';
  resources: string[];
  studentFocus: string;
}

export interface Roadmap {
  repoId: string;
  repoName: string;
  title: string;
  techStack: string[];
  steps: RoadmapStep[];
  progressPercent: number;
}

const mapNodeStatus = (status: string): RoadmapStep['status'] => {
  if (status === 'completed') return 'completed';
  if (status === 'in-progress' || status === 'unlocked') return 'in_progress';
  return 'locked';
};

const webRoadmapToMobile = (roadmap: WebRoadmap): Roadmap => {
  const steps: RoadmapStep[] = roadmap.modules.flatMap((module) =>
    module.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      description: node.description,
      duration: `${node.estimatedHours}h`,
      status: mapNodeStatus(node.status),
      resources: (node.resources || []).map((resource) => resource.title),
      studentFocus: roadmap.description,
    }))
  );

  return {
    repoId: roadmap.id,
    repoName: roadmap.careerOutcome || roadmap.title,
    title: roadmap.title,
    techStack: roadmap.requiredSkills.length > 0 ? roadmap.requiredSkills : roadmap.tags,
    steps: steps.length > 0 ? steps : [{
      id: `${roadmap.id}-default`,
      title: 'Bắt đầu lộ trình',
      description: roadmap.description,
      duration: 'Tuần 1',
      status: 'in_progress',
      resources: ['Tài liệu chính thức'],
      studentFocus: roadmap.subtitle,
    }],
    progressPercent: roadmap.progress,
  };
};

const mapFeedbackToRoadmap = (feedback: Record<string, unknown>, repoId: string, repoName: string): Roadmap => {
  const nextSteps = (feedback.nextSteps as string[]) || [];
  const recommendedTopics = (feedback.recommendedTopics as string[]) || [];
  const learningAdvice = String(
    feedback.learningAdvice ?? feedback.portfolioAdvice ?? 'Tập trung nâng cao kiến trúc mã nguồn sạch và tự động hóa.'
  );

  const steps: RoadmapStep[] = nextSteps.map((stepText, index) => {
    const sliceStart = index * 2;
    const resources = recommendedTopics.slice(sliceStart, sliceStart + 2);
    if (resources.length === 0) {
      resources.push('Tài liệu chính thức (Official Documentation)');
    }

    return {
      id: `step_${repoId}_${index}`,
      title: stepText,
      description: `Áp dụng và triển khai nâng cấp: "${stepText}" vào mã nguồn của bạn.`,
      duration: `Tuần ${index + 1}`,
      status: index === 0 ? 'in_progress' : 'locked',
      resources,
      studentFocus: learningAdvice,
    };
  });

  if (steps.length === 0) {
    steps.push({
      id: `step_${repoId}_default`,
      title: 'Đọc hiểu mã nguồn & Chẩn hóa README',
      description: 'Đọc kỹ các đề xuất trong tab README Audit để nâng cấp tài liệu dự án.',
      duration: 'Tuần 1',
      status: 'in_progress',
      resources: ['Viết tài liệu GitHub README chuyên nghiệp'],
      studentFocus: learningAdvice,
    });
  }

  const completedCount = steps.filter((step) => step.status === 'completed').length;

  return {
    repoId,
    repoName,
    title: `Lộ trình phát triển: ${repoName}`,
    techStack: recommendedTopics.length > 0 ? recommendedTopics : ['Software Development'],
    steps,
    progressPercent: Math.round((completedCount / steps.length) * 100),
  };
};

export const fetchRoadmap = async (repoId: string, repoName: string): Promise<Roadmap | null> => {
  try {
    const payload = await aiFeedbackApi.getResult(repoId);
    const feedback = extractApiResource<Record<string, unknown>>(payload, ['feedback']);

    if (!feedback || !feedback.nextSteps) {
      return null;
    }

    return mapFeedbackToRoadmap(feedback, repoId, repoName);
  } catch {
    return null;
  }
};

export const generateRoadmap = async (repoId: string, repoName: string): Promise<Roadmap> => {
  const payload = await aiFeedbackApi.generate(repoId);
  const feedback = extractApiResource<Record<string, unknown>>(payload, ['feedback']);

  if (!feedback) {
    throw new Error('Không thể tạo lộ trình học tập từ backend.');
  }

  return mapFeedbackToRoadmap(feedback, repoId, repoName);
};

export const fetchMyRoadmapsList = async (): Promise<Roadmap[]> => {
  const roadmapMap = new Map<string, Roadmap>();

  try {
    const careerRoadmaps = await roadmapService.getRoadmaps({ status: 'active' });
    careerRoadmaps.forEach((roadmap) => {
      const mobile = webRoadmapToMobile(roadmap);
      roadmapMap.set(mobile.repoId, mobile);
    });
  } catch {
    // Continue with AI feedback roadmaps
  }

  try {
    const payload = await aiFeedbackApi.getMine();
    const feedbacks = extractApiResource<Record<string, unknown>[]>(payload, ['feedbacks']) || [];
    feedbacks.forEach((feedback) => {
      const repoId = String(feedback.repositoryId ?? '');
      if (!repoId) return;
      const mobile = mapFeedbackToRoadmap(feedback, repoId, String(feedback.repoName ?? 'Dự án'));
      roadmapMap.set(repoId, mobile);
    });
  } catch {
    // Ignore if unavailable
  }

  return Array.from(roadmapMap.values());
};

export const fetchCareerRoadmaps = async () => {
  return roadmapService.getRoadmaps({ status: 'active' });
};

export const fetchCareerRoadmapById = async (idOrSlug: string) => {
  const roadmap = await roadmapService.getRoadmapById(idOrSlug);
  return roadmap ? webRoadmapToMobile(roadmap) : undefined;
};

export const generateAIRoadmap = async (targetRole?: string, forceRegenerate = false) => {
  const recommendation = await roadmapService.generateAIRoadmap(targetRole, forceRegenerate);
  return {
    recommendation,
    roadmap: webRoadmapToMobile(recommendation.roadmap),
  };
};

export const archiveRoadmap = async (roadmapId: string) => {
  const roadmap = await roadmapService.archiveRoadmap(roadmapId);
  return webRoadmapToMobile(roadmap);
};
