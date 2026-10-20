import { clearSession, readSession, saveSession } from '@bharini/auth';
import type { ApiEnvelope, AuthUser, TokenPair } from '@bharini/types';

export type ApiClientOptions = {
  baseUrl?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  credentials?: RequestCredentials;
};

export type AuthApiResponse<T> = ApiEnvelope<T>;

export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string[]> = {}) {
    super(message);
  }
}

export class ApiClient {
  baseUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  credentials: RequestCredentials;

  constructor(options: ApiClientOptions = {}) {
    const stored = readSession();
    this.baseUrl = options.baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
    this.accessToken = options.accessToken ?? stored.accessToken ?? null;
    this.refreshToken = options.refreshToken ?? stored.refreshToken ?? null;
    this.credentials = options.credentials ?? 'include';
  }

  setSession(session: Partial<{ accessToken: string | null; refreshToken: string | null }>) {
    this.accessToken = session.accessToken ?? this.accessToken ?? null;
    this.refreshToken = session.refreshToken ?? this.refreshToken ?? null;
    saveSession({ accessToken: this.accessToken, refreshToken: this.refreshToken });
  }

  clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    clearSession();
  }

  setAccessToken(accessToken: string | null) {
    this.accessToken = accessToken;
    saveSession({ accessToken, refreshToken: this.refreshToken });
  }

  setRefreshToken(refreshToken: string | null) {
    this.refreshToken = refreshToken;
    saveSession({ accessToken: this.accessToken, refreshToken });
  }

  private isPublicAuthEndpoint(path: string): boolean {
    return (
      path.includes('/auth/register/') ||
      path.includes('/auth/login/') ||
      path.includes('/auth/refresh/') ||
      path.includes('/auth/verify-email/') ||
      path.includes('/auth/password/reset/')
    );
  }

  private async requestInternal<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    headers.set('Content-Type', 'application/json');

    const publicAuthEndpoint = this.isPublicAuthEndpoint(path);
    if (this.accessToken && !publicAuthEndpoint) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: this.credentials,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (response.status === 401 && !isRetry && this.refreshToken && !publicAuthEndpoint) {
      try {
        const refreshed = await this.refresh(this.refreshToken);
        const nextAccessToken = refreshed.data?.access ?? null;
        const nextRefreshToken = refreshed.data?.refresh ?? this.refreshToken;

        if (nextAccessToken) {
          this.setSession({ accessToken: nextAccessToken, refreshToken: nextRefreshToken });
          return this.requestInternal<T>(path, init, true);
        }
      } catch {
        this.clearSession();
      }
    }

    if (!response.ok) {
      const message = typeof payload === 'string' ? payload : payload?.message || 'Request failed';
      throw new ApiError(message, typeof payload === 'string' ? {} : payload?.field_errors);
    }

    return payload as T;
  }

  request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestInternal<T>(path, init, false);
  }

  register(payload: {
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    password: string;
    password_confirm: string;
  }) {
    return this.request<AuthApiResponse<{ user: AuthUser; tokens: TokenPair }>>('/api/v1/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  login(payload: { email: string; password: string }) {
    return this.request<AuthApiResponse<{ user: AuthUser; tokens: TokenPair }>>('/api/v1/auth/login/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  refresh(refreshToken: string) {
    return this.request<AuthApiResponse<{ access: string; refresh: string }>>('/api/v1/auth/refresh/', {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken }),
    });
  }

  logout(refreshToken?: string | null) {
    return this.request<AuthApiResponse<null>>('/api/v1/auth/logout/', {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken ?? this.refreshToken }),
    });
  }

  me() {
    return this.request<AuthApiResponse<AuthUser>>('/api/v1/auth/me/');
  }

  verifyEmail(payload: { uid: string; token: string }) {
    return this.request<AuthApiResponse<null>>('/api/v1/auth/verify-email/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  requestPasswordReset(payload: { email: string }) {
    return this.request<AuthApiResponse<null>>('/api/v1/auth/password/reset/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  confirmPasswordReset(payload: { uid: string; token: string; password: string; password_confirm: string }) {
    return this.request<AuthApiResponse<null>>('/api/v1/auth/password/reset/confirm/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
});

export default ApiClient;
