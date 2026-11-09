import { ApiClient, ApiError } from '@bharini/api-client';
import { AUTH_STORAGE_KEYS, setSessionStorage } from '@bharini/auth';

const storage = new Map<string, string>();
const fetchMock = jest.fn();

function jsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function envelope(data: unknown) {
  return { code: 'ok', message: '', request_id: '', data };
}

function requestHeaders(call: number) {
  return new Headers(fetchMock.mock.calls[call][1]?.headers);
}

describe('ApiClient security and regression behavior', () => {
  let client: ApiClient;

  beforeEach(() => {
    storage.clear();
    setSessionStorage({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    });
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
    client = new ApiClient({
      baseUrl: 'https://api.example.test',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });
  });

  it.each([
    '/api/v1/auth/login/',
    '/api/v1/auth/register/',
    '/api/v1/auth/refresh/',
    '/api/v1/auth/password/reset/',
  ])('does not send access credentials to public auth endpoint %s', async (path) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({})));

    await client.request(path);

    expect(requestHeaders(0).has('Authorization')).toBe(false);
    expect(fetchMock.mock.calls[0][0]).not.toContain('access-secret');
    expect(fetchMock.mock.calls[0][0]).not.toContain('refresh-secret');
  });

  it('sends access tokens only in the Authorization header for protected API requests', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({})));

    await client.request('/api/v1/profile/');

    expect(requestHeaders(0).get('Authorization')).toBe('Bearer access-secret');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/v1/profile/');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('refreshes a rejected access token once and rotates both stored tokens', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, envelope({ access: 'next-access', refresh: 'next-refresh' })))
      .mockResolvedValueOnce(jsonResponse(200, envelope({ data: 'ok' })));

    await client.request('/api/v1/profile/');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestHeaders(0).get('Authorization')).toBe('Bearer access-secret');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refresh: 'refresh-secret' });
    expect(requestHeaders(2).get('Authorization')).toBe('Bearer next-access');
    expect(client.accessToken).toBe('next-access');
    expect(client.refreshToken).toBe('next-refresh');
    expect(storage.get(AUTH_STORAGE_KEYS.accessToken)).toBe('next-access');
    expect(storage.get(AUTH_STORAGE_KEYS.refreshToken)).toBe('next-refresh');
  });

  it('does not retry a protected request more than once', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, envelope({ access: 'next-access', refresh: 'next-refresh' })))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'still unauthorized' }));

    await expect(client.request('/api/v1/profile/')).rejects.toMatchObject({
      status: 401,
      message: 'still unauthorized',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares one refresh request between concurrent unauthorized requests', async () => {
    let resolveRefresh!: (response: Response) => void;
    const requestCounts = new Map<string, number>();
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh/')) {
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      if (url.endsWith('/profile/a') || url.endsWith('/profile/b')) {
        const requestCount = (requestCounts.get(url) ?? 0) + 1;
        requestCounts.set(url, requestCount);
        return Promise.resolve(requestCount === 1
          ? jsonResponse(401, { detail: 'expired' })
          : jsonResponse(200, envelope({})));
      }
      return Promise.resolve(jsonResponse(200, envelope({})));
    });

    const first = client.request('/api/v1/profile/a');
    const second = client.request('/api/v1/profile/b');
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRefresh(jsonResponse(200, envelope({ access: 'next-access', refresh: 'next-refresh' })));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh/'))).toHaveLength(1);
  });

  it('clears local tokens if refresh is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'refresh revoked' }));

    await expect(client.request('/api/v1/profile/')).rejects.toBeInstanceOf(ApiError);

    expect(client.accessToken).toBeNull();
    expect(client.refreshToken).toBeNull();
    expect(storage.has(AUTH_STORAGE_KEYS.accessToken)).toBe(false);
    expect(storage.has(AUTH_STORAGE_KEYS.refreshToken)).toBe(false);
  });

  it('surfaces throttling status and retry details without retrying or clearing the session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { detail: 'Request was throttled. Retry in 12 seconds.' }));

    await expect(client.request('/api/v1/profile/')).rejects.toMatchObject({
      status: 429,
      message: 'Request was throttled. Retry in 12 seconds.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.accessToken).toBe('access-secret');
    expect(client.refreshToken).toBe('refresh-secret');
  });

  it('preserves server field errors for validation feedback', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, {
      code: 'validation_error',
      message: 'Invalid input',
      field_errors: { email: ['Invalid email'] },
    }));

    await expect(client.request('/api/v1/auth/login/')).rejects.toMatchObject({
      status: 400,
      fieldErrors: { email: ['Invalid email'] },
    });
  });

  it('does not overwrite multipart boundaries when uploading files', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({})));
    const body = new FormData();

    await client.request('/api/v1/profile/documents/', { method: 'POST', body });

    expect(requestHeaders(0).has('Content-Type')).toBe(false);
    expect(requestHeaders(0).get('Authorization')).toBe('Bearer access-secret');
  });

  it('encodes user-controlled query values before building API URLs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, envelope({})));

    await client.checkUsername('artist&admin=true #1');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/v1/profile/username-check/?username=artist%26admin%3Dtrue%20%231',
    );
  });

  it('encodes the optional social-login role as a query value, not as URL structure', () => {
    expect(client.socialLoginUrl('google', 'artist&next=https://attacker.test')).toBe(
      'https://api.example.test/api/v1/auth/social/google/start/?role=artist%26next%3Dhttps%3A%2F%2Fattacker.test',
    );
  });
});
