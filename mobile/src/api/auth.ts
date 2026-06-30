import { apiClient, clearToken, setToken, unwrapResponse } from './client';

type LoginRequest = {
  email: string;
  password: string;
};

type RegisterRequest = LoginRequest & {
  fullName: string;
};

type GoogleLoginRequest = {
  idToken: string;
};

type GithubLoginRequest = {
  accessToken?: string;
  redirectUrl?: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type AuthPayload = {
  token?: string;
  accessToken?: string;
  jwt?: string;
  user?: unknown;
  profile?: unknown;
};

const findToken = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;

  const record = payload as Record<string, unknown>;
  const directToken = record.token ?? record.accessToken ?? record.access_token ?? record.jwt ?? record.jwtToken;

  if (typeof directToken === 'string') return directToken;

  return findToken(record.data) ?? findToken(record.result) ?? findToken(record.user);
};

const persistToken = async (payload: unknown) => {
  const token = findToken(payload);

  if (token) {
    await setToken(token);
  }

  return token;
};

export const authApi = {
  async register(payload: RegisterRequest) {
    const response = await apiClient.post('/auth/register', payload);
    await persistToken(response.data);
    return unwrapResponse<AuthPayload>(response.data);
  },

  async login(payload: LoginRequest) {
    const response = await apiClient.post('/auth/login', payload);
    await persistToken(response.data);
    return unwrapResponse<AuthPayload>(response.data);
  },

  async loginWithGoogle(payload: GoogleLoginRequest) {
    const response = await apiClient.post('/auth/google', payload);
    await persistToken(response.data);
    return unwrapResponse<AuthPayload>(response.data);
  },

  async getGithubAuthUrl(redirectUrl: string) {
    const response = await apiClient.post('/auth/github', { redirectUrl });
    const record = response.data as Record<string, unknown>;
    const url = record.authUrl ?? record.authorizeUrl ?? record.oauthUrl ?? record.url;
    if (typeof url === 'string') return url;
    throw new Error('Backend không trả về authUrl hợp lệ');
  },

  async loginWithGithub(payload: GithubLoginRequest) {
    const response = await apiClient.post('/auth/github', payload);
    await persistToken(response.data);
    return unwrapResponse<AuthPayload>(response.data);
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      await clearToken();
    }
  },

  async changePassword(payload: ChangePasswordRequest) {
    const response = await apiClient.post('/auth/change-password', payload);
    return unwrapResponse(response.data);
  },

  async me() {
    const response = await apiClient.get('/auth/me');
    return unwrapResponse(response.data);
  },
};
