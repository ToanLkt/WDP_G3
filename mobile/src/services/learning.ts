import { apiClient } from '../api/client';
import type { LearningResource } from '../features/roadmaps/types';

export interface LearningContent {
  requestedSkillName: string;
  skillName: string;
  canonicalSkillName: string;
  normalizedSkillName: string;
  targetRole: string;
  level: string;
  language: string;
  resources: LearningResource[];
}

export const fetchLearningContent = async (
  skillName: string,
  targetRole: string,
  level = 'beginner',
  language = 'vi'
): Promise<LearningContent | null> => {
  try {
    const encodedSkill = encodeURIComponent(skillName);
    const response = await apiClient.get(
      `/learning/skills/${encodedSkill}?targetRole=${encodeURIComponent(targetRole)}&level=${level}&language=${language}`
    );
    const res = response as any;
    return res.data?.data || res.data;
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const generateLearningContent = async (
  skillName: string,
  targetRole: string,
  level = 'beginner',
  language = 'vi',
  forceRegenerate = false
): Promise<LearningContent> => {
  const response = await apiClient.post('/learning/skills/generate', {
    skillName,
    targetRole,
    level,
    language,
    forceRegenerate,
  });
  const res = response as any;
  return res.data?.data || res.data;
};

export const fetchLearningResources = async (
  skillName: string,
  targetRole: string,
  level = 'beginner',
  language = 'en',
  type?: string
): Promise<LearningResource[]> => {
  try {
    const encodedSkill = encodeURIComponent(skillName);
    let url = `/learning/skills/${encodedSkill}/resources?targetRole=${encodeURIComponent(targetRole)}&level=${level}&language=${language}`;
    if (type) {
      url += `&type=${type}`;
    }
    const response = await apiClient.get(url);
    const res = response as any;
    const data = res.data?.data || res.data;
    return data.resources || [];
  } catch {
    return [];
  }
};

export const searchLearningResources = async (
  skillName: string,
  targetRole: string,
  level = 'beginner',
  language = 'en'
): Promise<LearningResource[]> => {
  const encodedSkill = encodeURIComponent(skillName);
  const response = await apiClient.post(`/learning/skills/${encodedSkill}/resources/search`, {
    targetRole,
    level,
    language,
  });
  const res = response as any;
  const data = res.data?.data || res.data;
  return data.resources || [];
};

export const getOrGenerateLearningFlow = async (
  skillName: string,
  targetRole: string
): Promise<LearningContent> => {
  // 1. GET learning content
  let content = await fetchLearningContent(skillName, targetRole);
  
  // 2. If 404, POST generate
  if (!content) {
    content = await generateLearningContent(skillName, targetRole);
  }
  
  // 3. GET resources
  let resources = await fetchLearningResources(skillName, targetRole);
  
  // 4. If resources empty, POST resources/search
  if (!resources || resources.length === 0) {
    resources = await searchLearningResources(skillName, targetRole);
  }
  
  content.resources = resources;
  return content;
};
