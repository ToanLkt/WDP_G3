import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { DEFAULT_API_BASE_URL, MOBILE_OAUTH_RETURN_URL } from '../constants';

const TOKEN_KEY = 'gitanalyzer.jwt';
const USER_KEY = 'gitanalyzer.user';

let authToken: string | null = null;
let customBaseUrl: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

export const getToken = () => authToken;

export const setToken = async (token: string | null) => {
  authToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
};

export const clearToken = async () => {
  authToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export const loadStoredToken = async () => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  authToken = token;
  return token;
};

export const getStoredUser = async <T>() => {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    await AsyncStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setStoredUser = async (user: unknown) => {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearStoredUser = async () => {
  await AsyncStorage.removeItem(USER_KEY);
};

export const setCustomBaseUrl = (url: string | null) => {
  customBaseUrl = url;
};

export const normalizeApiBaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

export const resolveHostForPlatform = (url: string) => {
  if (Platform.OS === 'android' && /\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    return url.replace(/\/\/(localhost|127\.0\.0\.1)/, '//10.0.2.2');
  }

  return url;
};

export const getApiBaseUrl = () => {
  if (customBaseUrl) {
    return normalizeApiBaseUrl(resolveHostForPlatform(customBaseUrl));
  }

  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return normalizeApiBaseUrl(resolveHostForPlatform(envUrl));
  }

  return DEFAULT_API_BASE_URL;
};

export const getOAuthCallbackUrl = () => {
  const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
  return `${apiBase}/api/github/oauth/callback`;
};

export const getMobileOAuthReturnUrl = () => MOBILE_OAUTH_RETURN_URL;

export const unwrapResponse = <T>(payload: unknown): T => {
  const value = payload as Record<string, unknown>;

  if (value?.data !== undefined) {
    return value.data as T;
  }

  if (value?.result !== undefined) {
    return value.result as T;
  }

  return payload as T;
};

export const extractApiResource = <T>(payload: unknown, keys: string[]): T => {
  const unwrapped = unwrapResponse<unknown>(payload);
  const record = unwrapped && typeof unwrapped === 'object' ? (unwrapped as Record<string, unknown>) : null;

  if (record) {
    for (const key of keys) {
      if (record[key] !== undefined) return record[key] as T;
    }
  }

  return unwrapped as T;
};

export const getApiErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Đã có lỗi xảy ra';
};

export const encodeRepoId = (repoId: string) => encodeURIComponent(repoId);

const paramsToRecord = (params?: Record<string, unknown>) => {
  if (!params) return undefined;

  const result: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  });

  return Object.keys(result).length > 0 ? result : undefined;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>
): Promise<T> {
  let url = `${getApiBaseUrl()}${path}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  const headers: Record<string, string> = {
    accept: '*/*',
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401) {
    await clearToken();
    await clearStoredUser();
    onUnauthorized?.();
  }

  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new Error(`Server trả về không phải JSON (có thể sai URL API hoặc repoId): ${text.slice(0, 120)}`);
      }
      data = { text };
    }
  }

  if (!response.ok) {
    const record = data as Record<string, unknown>;
    const rawText = typeof record.text === 'string' ? record.text : '';
    const errMsg = String(
      record?.message
      ?? record?.error
      ?? (rawText ? rawText.slice(0, 120) : `HTTP ${response.status}: ${response.statusText}`)
    );
    throw new Error(errMsg);
  }

  return data as T;
}

export const api = {
  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return request<T>('GET', path, undefined, params);
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body);
  },

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body);
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, body);
  },

  async delete<T = unknown>(path: string, body?: unknown): Promise<T> {
    return request<T>('DELETE', path, body);
  },
};

type ApiClientOptions = {
  params?: Record<string, unknown>;
};

const wrap = async <T>(promise: Promise<T>) => ({ data: await promise });

export const apiClient = {
  get: <T = unknown>(path: string, options?: ApiClientOptions) =>
    wrap<T>(api.get<T>(path, paramsToRecord(options?.params))),
  post: <T = unknown>(path: string, body?: unknown) => wrap<T>(api.post<T>(path, body)),
  put: <T = unknown>(path: string, body?: unknown) => wrap<T>(api.put<T>(path, body)),
  patch: <T = unknown>(path: string, body?: unknown) => wrap<T>(api.patch<T>(path, body)),
  delete: <T = unknown>(path: string, body?: unknown) => wrap<T>(api.delete<T>(path, body)),
};
