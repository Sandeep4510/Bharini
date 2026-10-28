import { clearSession, readSession, saveSession } from '@bharini/auth';
import type {
  ApiEnvelope,
  ArtistDirectoryFilters,
  ArtistDirectoryProfile,
  ArtistPost,
  ArtistPostComment,
  ArtistProfile,
  AuthUser,
  CastingCallDetails,
  ChatMessage,
  ConnectionRequest,
  ConnectionStatus,
  Conversation,
  CursorPage,
  FollowerResult,
  PhotoSlot,
  Post,
  PostComment,
  Production,
  ProfileLanguage,
  ProfileOptions,
  PublicProfile,
  SharedPostRef,
  TokenPair,
  UsernameCheck,
  UserSummary,
} from '@bharini/types';

export type ApiClientOptions = {
  baseUrl?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  credentials?: RequestCredentials;
};

export type AuthApiResponse<T> = ApiEnvelope<T>;

export class ApiError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string[]> = {},
    public status = 0,
  ) {
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

  setSession(
    session: Partial<{
      accessToken: string | null;
      refreshToken: string | null;
    }>,
  ) {
    this.accessToken = session.accessToken ?? this.accessToken ?? null;
    this.refreshToken = session.refreshToken ?? this.refreshToken ?? null;
    saveSession({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
    });
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

  // parallel 401s share one refresh: rotation blacklists the old refresh token, so a second spend would fail and wipe the session
  private refreshInFlight: Promise<string | null> | null = null;

  private refreshAccessToken(): Promise<string | null> {
    this.refreshInFlight ??= (async () => {
      try {
        const refreshToken = this.refreshToken;
        if (!refreshToken) return null;
        const refreshed = await this.refresh(refreshToken);
        const nextAccessToken = refreshed.data?.access ?? null;
        if (nextAccessToken) {
          this.setSession({ accessToken: nextAccessToken, refreshToken: refreshed.data?.refresh ?? refreshToken });
        }
        return nextAccessToken;
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
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

    const sentAccessToken = this.accessToken;
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: this.credentials,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (response.status === 401 && !isRetry && this.refreshToken && !publicAuthEndpoint) {
      try {
        // a parallel request may already have refreshed while this one was in flight
        const alreadyRefreshed = Boolean(this.accessToken) && this.accessToken !== sentAccessToken;
        const nextAccessToken = alreadyRefreshed ? this.accessToken : await this.refreshAccessToken();
        if (nextAccessToken) return this.requestInternal<T>(path, init, true);
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

  chooseRole(role: 'artist' | 'production_house') {
    return this.request<AuthApiResponse<AuthUser>>('/api/v1/auth/choose-role/', {
      method: 'POST',
      body: JSON.stringify({ role }),
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
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/media/${discipline}/${slot}/`, {
      method: 'PUT',
      body,
    });
  }

  deleteMedia(discipline: string, slot: string) {
    return this.request<AuthApiResponse<ArtistProfile>>(`/api/v1/profile/media/${discipline}/${slot}/`, {
      method: 'DELETE',
    });
  }

  checkUsername(username: string) {
    return this.request<AuthApiResponse<UsernameCheck>>(
      `/api/v1/profile/username-check/?username=${encodeURIComponent(username)}`,
    );
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

  listArtistProfiles(filters: ArtistDirectoryFilters = {}) {
    const entries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== '');
    const query = new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString();
    return this.request<AuthApiResponse<{ results: ArtistDirectoryProfile[] }>>(
      `/api/v1/profile/directory/${query ? `?${query}` : ''}`,
    );
  }

  getMyProduction() {
    return this.request<AuthApiResponse<Production | null>>('/api/v1/productions/me/');
  }

  createProduction(payload: FormData | Record<string, unknown>) {
    return this.request<AuthApiResponse<Production>>('/api/v1/productions/', {
      method: 'POST',
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    });
  }

  updateProduction(id: number, payload: FormData) {
    return this.request<AuthApiResponse<Production>>(`/api/v1/productions/${id}/`, { method: 'PATCH', body: payload });
  }

  getOpportunities() {
    return this.request<AuthApiResponse<{ posts: Post[] }>>('/api/v1/feed/opportunities/');
  }

  getProduction(id: number) {
    return this.request<AuthApiResponse<Production>>(`/api/v1/productions/${id}/`);
  }

  listPosts(cursor: string | null = null) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.request<AuthApiResponse<CursorPage<Post>>>(`/api/v1/feed/${query}`);
  }

  listProductionPosts(productionId: number, cursor: string | null = null) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.request<AuthApiResponse<CursorPage<Post>>>(`/api/v1/productions/${productionId}/posts/${query}`);
  }

  createPost(body: string, media?: File | null): Promise<AuthApiResponse<ArtistPost>>;
  createPost(
    payload: {
      post_type: 'casting_call';
      body: string;
      casting: CastingCallDetails;
    },
    media?: File | null,
  ): Promise<AuthApiResponse<Post>>;
  createPost(
    bodyOrPayload:
      | string
      | {
          post_type: 'casting_call';
          body: string;
          casting: CastingCallDetails;
        },
    media?: File | null,
  ): Promise<AuthApiResponse<ArtistPost> | AuthApiResponse<Post>> {
    if (typeof bodyOrPayload === 'string') {
      const form = new FormData();
      form.append('body', bodyOrPayload);
      if (media) form.append('media', media);
      return this.request<AuthApiResponse<ArtistPost>>('/api/v1/posts/', {
        method: 'POST',
        body: form,
      });
    }
    if (media) {
      const form = new FormData();
      form.append('post_type', bodyOrPayload.post_type);
      form.append('body', bodyOrPayload.body);
      form.append('casting', JSON.stringify(bodyOrPayload.casting));
      form.append('image', media);
      return this.request<AuthApiResponse<Post>>('/api/v1/feed/', { method: 'POST', body: form });
    }
    return this.request<AuthApiResponse<Post>>('/api/v1/feed/', {
      method: 'POST',
      body: JSON.stringify(bodyOrPayload),
    });
  }

  likePost(id: number) {
    return this.request<AuthApiResponse<{ like_count: number; is_liked: boolean }>>(`/api/v1/feed/${id}/like/`, {
      method: 'POST',
    });
  }

  unlikePost(id: number) {
    return this.request<AuthApiResponse<{ like_count: number; is_liked: boolean }>>(`/api/v1/feed/${id}/like/`, {
      method: 'DELETE',
    });
  }

  sharePost(id: number) {
    return this.request<AuthApiResponse<{ share_count: number }>>(`/api/v1/feed/${id}/share/`, {
      method: 'POST',
    });
  }

  listComments(postId: number, cursor: string | null = null) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return this.request<AuthApiResponse<CursorPage<PostComment>>>(`/api/v1/feed/${postId}/comments/${query}`);
  }

  addComment(postId: number, body: string) {
    return this.request<AuthApiResponse<PostComment>>(`/api/v1/feed/${postId}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  getPosts() {
    return this.request<AuthApiResponse<{ posts: ArtistPost[] }>>('/api/v1/posts/');
  }

  updatePost(id: number, changes: { body: string; media?: File | null; removeMedia?: boolean }) {
    const form = new FormData();
    form.append('body', changes.body);
    if (changes.media) form.append('media', changes.media);
    if (changes.removeMedia) form.append('remove_media', 'true');
    return this.request<AuthApiResponse<ArtistPost>>(`/api/v1/posts/${id}/`, { method: 'PATCH', body: form });
  }

  deletePost(id: number) {
    return this.request<AuthApiResponse<null>>(`/api/v1/posts/${id}/`, { method: 'DELETE' });
  }

  getPost(id: number) {
    return this.request<AuthApiResponse<ArtistPost>>(`/api/v1/posts/${id}/`);
  }

  setLike(id: number, liked: boolean) {
    return this.request<AuthApiResponse<{ liked: boolean; like_count: number }>>(`/api/v1/posts/${id}/like/`, {
      method: liked ? 'POST' : 'DELETE',
    });
  }

  getComments(postId: number) {
    return this.request<AuthApiResponse<{ comments: ArtistPostComment[] }>>(`/api/v1/posts/${postId}/comments/`);
  }

  addArtistComment(postId: number, body: string) {
    return this.request<AuthApiResponse<ArtistPostComment>>(`/api/v1/posts/${postId}/comments/`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  deleteComment(postId: number, commentId: number) {
    return this.request<AuthApiResponse<null>>(`/api/v1/posts/${postId}/comments/${commentId}/`, { method: 'DELETE' });
  }

  getConversations() {
    return this.request<AuthApiResponse<{ conversations: Conversation[] }>>('/api/v1/messages/conversations/');
  }

  startConversation(userId: number) {
    return this.request<AuthApiResponse<Conversation>>('/api/v1/messages/conversations/', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  }

  getMessages(conversationId: number, afterId?: number) {
    const query = afterId ? `?after=${afterId}` : '';
    return this.request<AuthApiResponse<{ conversation: Conversation; messages: ChatMessage[] }>>(
      `/api/v1/messages/conversations/${conversationId}/messages/${query}`,
    );
  }

  sendMessage(conversationId: number, body: string, shared?: SharedPostRef) {
    return this.request<AuthApiResponse<ChatMessage>>(`/api/v1/messages/conversations/${conversationId}/messages/`, {
      method: 'POST',
      body: JSON.stringify({ body, ...(shared ? { [`shared_${shared.kind}_post_id`]: shared.id } : {}) }),
    });
  }

  searchPeople(query: string) {
    return this.request<AuthApiResponse<{ results: UserSummary[] }>>(`/api/v1/users/search/?q=${encodeURIComponent(query)}`);
  }

  getFollowList(userId: number, which: 'followers' | 'following') {
    return this.request<AuthApiResponse<{ people: UserSummary[] }>>(`/api/v1/users/${userId}/${which}/`);
  }

  getMyConnections(query = '') {
    return this.request<AuthApiResponse<{ connections: UserSummary[] }>>(
      `/api/v1/users/me/connections/?q=${encodeURIComponent(query)}`,
    );
  }

  setConnection(userId: number, connect: boolean) {
    return this.request<AuthApiResponse<{ connection: ConnectionStatus }>>(`/api/v1/users/${userId}/connect/`, {
      method: connect ? 'POST' : 'DELETE',
    });
  }

  getConnectionRequests() {
    return this.request<AuthApiResponse<{ requests: ConnectionRequest[] }>>('/api/v1/users/me/connection-requests/');
  }

  searchFollowers(query: string) {
    return this.request<AuthApiResponse<{ followers: FollowerResult[] }>>(
      `/api/v1/users/me/followers/?q=${encodeURIComponent(query)}`,
    );
  }

  getUnreadMessageCount() {
    return this.request<AuthApiResponse<{ unread: number }>>('/api/v1/messages/unread-count/');
  }

  getUserProfile(id: number) {
    return this.request<AuthApiResponse<PublicProfile>>(`/api/v1/users/${id}/`);
  }

  setFollow(id: number, following: boolean) {
    return this.request<AuthApiResponse<{ is_following: boolean; follower_count: number }>>(
      `/api/v1/users/${id}/follow/`,
      {
        method: following ? 'POST' : 'DELETE',
      },
    );
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
