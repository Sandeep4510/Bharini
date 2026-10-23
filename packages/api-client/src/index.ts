import { clearSession, readSession, saveSession } from '@bharini/auth';
import type {
  ApiEnvelope,
  ArtistProfile,
  AuthUser,
  PhotoSlot,
  Post,
  PostComment,
  PublicProfile,
  ProfileLanguage,
  ProfileOptions,
  TokenPair,
  UsernameCheck,
} from '@bharini/types';

export type ApiClientOptions = {
  baseUrl?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  credentials?: RequestCredentials;
};

export type AuthApiResponse<T> = ApiEnvelope<T>;

export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string[]> = {}, public status = 0) {
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
      path.includes('/auth/password/reset/') ||
      path.includes('/auth/social/')
    );
  }

  private async requestInternal<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    // FormData needs the browser to set its own multipart boundary
    if (!(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

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
      const message = typeof payload === 'string' ? payload : payload?.message || payload?.detail || 'Request failed';
      throw new ApiError(message, typeof payload === 'string' ? {} : payload?.field_errors, response.status);
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

  /** Full-page URL that starts Google sign-in on the backend (django-allauth). */
  socialLoginUrl(provider: 'google', role?: string) {
    return `${this.baseUrl}/api/v1/auth/social/${provider}/start/${role ? `?role=${encodeURIComponent(role)}` : ''}`;
  }

  exchangeSocialCode(code: string) {
    return this.request<AuthApiResponse<{ user: AuthUser; tokens: TokenPair }>>('/api/v1/auth/social/exchange/', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  getProfile() {
    return this.request<AuthApiResponse<ArtistProfile>>('/api/v1/profile/');
  }

  getProfileOptions() {
    return this.request<AuthApiResponse<ProfileOptions>>('/api/v1/profile/options/');
  }

  updateProfile(payload: FormData | Record<string, unknown>) {
    return this.request<AuthApiResponse<ArtistProfile>>('/api/v1/profile/', {
      method: 'PATCH',
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    });
  }

  setLanguages(languages: ProfileLanguage[]) {
    return this.request<AuthApiResponse<ArtistProfile>>('/api/v1/profile/languages/', {
      method: 'PUT',
      body: JSON.stringify({ languages }),
    });
  }

  uploadPhoto(slot: PhotoSlot, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/photos/${slot}/`, { method: 'PUT', body });
  }

  deletePhoto(slot: PhotoSlot) {
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/photos/${slot}/`, { method: 'DELETE' });
  }

  uploadMedia(discipline: string, slot: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/media/${discipline}/${slot}/`, { method: 'PUT', body });
  }

  deleteMedia(discipline: string, slot: string) {
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/media/${discipline}/${slot}/`, { method: 'DELETE' });
  }

  checkUsername(username: string) {
    return this.request<AuthApiResponse<UsernameCheck>>(`/api/v1/profile/username-check/?username=${encodeURIComponent(username)}`);
  }

  addDocument(kind: string, title: string, file: File) {
    const body = new FormData();
    body.append('kind', kind);
    body.append('title', title);
    body.append('file', file);
    return this.request<AuthApiResponse<ArtistProfile>>('/api/v1/profile/documents/', { method: 'POST', body });
  }

  deleteDocument(id: number) {
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/documents/${id}/`, { method: 'DELETE' });
  }

  getPosts() {
    return this.request<AuthApiResponse<{ posts: Post[] }>>('/api/v1/posts/');
  }

  createPost(body: string, media?: File | null) {
    const form = new FormData();
    form.append('body', body);
    if (media) form.append('media', media);
    return this.request<AuthApiResponse<Post>>('/api/v1/posts/', { method: 'POST', body: form });
  }

  updatePost(id: number, changes: { body: string; media?: File | null; removeMedia?: boolean }) {
    const form = new FormData();
    form.append('body', changes.body);
    if (changes.media) form.append('media', changes.media);
    if (changes.removeMedia) form.append('remove_media', 'true');
    return this.request<AuthApiResponse<Post>>(`/api/v1/posts/${id}/`, { method: 'PATCH', body: form });
  }

  deletePost(id: number) {
    return this.request<AuthApiResponse<null>>(`/api/v1/posts/${id}/`, { method: 'DELETE' });
  }

  getPost(id: number) {
    return this.request<AuthApiResponse<Post>>(`/api/v1/posts/${id}/`);
  }

  setLike(id: number, liked: boolean) {
    return this.request<AuthApiResponse<{ liked: boolean; like_count: number }>>(`/api/v1/posts/${id}/like/`, {
      method: liked ? 'POST' : 'DELETE',
    });
  }

  getComments(postId: number) {
    return this.request<AuthApiResponse<{ comments: PostComment[] }>>(`/api/v1/posts/${postId}/comments/`);
  }

  addComment(postId: number, body: string) {
    return this.request<AuthApiResponse<PostComment>>(`/api/v1/posts/${postId}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  deleteComment(postId: number, commentId: number) {
    return this.request<AuthApiResponse<null>>(`/api/v1/posts/${postId}/comments/${commentId}/`, { method: 'DELETE' });
  }

  getUserProfile(id: number) {
    return this.request<AuthApiResponse<PublicProfile>>(`/api/v1/users/${id}/`);
  }

  setFollow(id: number, following: boolean) {
    return this.request<AuthApiResponse<{ is_following: boolean; follower_count: number }>>(`/api/v1/users/${id}/follow/`, {
      method: following ? 'POST' : 'DELETE',
    });
  }

  sendAltEmailPin() {
    return this.request<AuthApiResponse<null>>('/api/v1/profile/alt-email/send-pin/', { method: 'POST' });
  }

  verifyAltEmailPin(pin: string) {
    return this.request<AuthApiResponse<ArtistProfile>>('/api/v1/profile/alt-email/verify/', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }
}

export const apiClient = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
});

export default ApiClient;
