import { authApi } from '../api/auth';
import { profileApi } from '../api/profile';
import { extractApiResource, getToken, setStoredUser } from '../api/client';
import { normalizeUser } from '../api/normalizers';
import type { User } from '../types';

export type { User };

export interface AuthResponse {
  token: string;
  user: User;
}

export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
  const payload = await authApi.login({ email, password });
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token not found in server response.');
  }

  const userPayload = extractApiResource<Record<string, unknown>>(payload, ['user', 'account', 'profile']);
  const user = normalizeUser({ ...(userPayload || {}), email });
  await setStoredUser(user);

  return { token, user };
};

export const getGithubAuthUrl = async (redirectUrl: string): Promise<string> => {
  return await authApi.getGithubAuthUrl(redirectUrl);
};

export const loginWithGoogle = async (idToken: string): Promise<AuthResponse> => {
  const payload = await authApi.loginWithGoogle({ idToken });
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token not found in server response.');
  }

  const userPayload = extractApiResource<Record<string, unknown>>(payload, ['user', 'account', 'profile']);
  const user = normalizeUser(userPayload || {});
  await setStoredUser(user);

  return { token, user };
};

export const loginWithGithub = async (accessToken: string): Promise<AuthResponse> => {
  const payload = await authApi.loginWithGithub({ accessToken });
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token not found in server response.');
  }

  const userPayload = extractApiResource<Record<string, unknown>>(payload, ['user', 'account', 'profile']);
  const user = normalizeUser({ ...(userPayload || {}), githubConnected: true });
  await setStoredUser(user);

  return { token, user };
};

export const registerUser = async (email: string, password: string, name: string): Promise<AuthResponse> => {
  const payload = await authApi.register({ email, password, fullName: name });
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token not found in server response.');
  }

  const userPayload = extractApiResource<Record<string, unknown>>(payload, ['user', 'account', 'profile']);
  const user = normalizeUser({ ...(userPayload || {}), email, fullName: name });
  await setStoredUser(user);

  return { token, user };
};

export const fetchCurrentUser = async (): Promise<User> => {
  const payload = await authApi.me();
  const user = normalizeUser(payload);
  await setStoredUser(user);
  return user;
};

export const logoutUser = async (): Promise<void> => {
  await authApi.logout();
};

export const changePassword = async (
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) => {
  return authApi.changePassword({ currentPassword, newPassword, confirmPassword });
};

export const fetchProfile = async () => {
  return profileApi.me();
};

export const updateProfile = async (payload: Parameters<typeof profileApi.update>[0]) => {
  return profileApi.update(payload);
};

export const createProfile = async (payload: Parameters<typeof profileApi.create>[0]) => {
  return profileApi.create(payload);
};
