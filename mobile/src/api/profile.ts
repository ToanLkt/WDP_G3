import { apiClient, unwrapResponse } from './client';

export type ProfilePayload = {
  fullName: string;
  university: string;
  major: string;
  year: number;
  targetCareer: string;
  currentSkills: string[];
  githubUsername?: string;
};

export const profileApi = {
  async create(payload: ProfilePayload) {
    const response = await apiClient.post('/profiles', payload);
    return unwrapResponse(response.data);
  },

  async me() {
    const response = await apiClient.get('/profiles/me');
    return unwrapResponse(response.data);
  },

  async update(payload: Partial<ProfilePayload>) {
    const response = await apiClient.patch('/profiles/me', payload);
    return unwrapResponse(response.data);
  },
};
