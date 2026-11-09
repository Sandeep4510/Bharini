import {
  AUTH_STORAGE_KEYS,
  clearSession,
  hydrateSession,
  isAuthenticated,
  readSession,
  saveSession,
  setSessionStorage,
  type SessionStorage,
} from '@bharini/auth';

function createStorage() {
  const values = new Map<string, string>();
  const storage: SessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return { storage, values };
}

describe('shared auth session storage', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    const setup = createStorage();
    values = setup.values;
    setSessionStorage(setup.storage);
  });

  it('uses separate storage keys for access and refresh tokens', () => {
    expect(AUTH_STORAGE_KEYS.accessToken).not.toBe(AUTH_STORAGE_KEYS.refreshToken);
  });

  it('treats missing and blank tokens as unauthenticated', () => {
    expect(readSession()).toEqual({ accessToken: null, refreshToken: null });
    values.set(AUTH_STORAGE_KEYS.accessToken, '');
    values.set(AUTH_STORAGE_KEYS.refreshToken, '');
    expect(readSession()).toEqual({ accessToken: null, refreshToken: null });
    expect(isAuthenticated()).toBe(false);
  });

  it('persists tokens independently and returns them without transformation', () => {
    saveSession({ accessToken: 'access-value', refreshToken: 'refresh-value' });
    expect(readSession()).toEqual({ accessToken: 'access-value', refreshToken: 'refresh-value' });
    expect(isAuthenticated()).toBe(true);
  });

  it('removes explicitly null tokens without deleting the other token', () => {
    saveSession({ accessToken: 'access-value', refreshToken: 'refresh-value' });
    saveSession({ accessToken: null });
    expect(readSession()).toEqual({ accessToken: null, refreshToken: 'refresh-value' });
  });

  it('hydrates absent fields from the current secure store', () => {
    saveSession({ accessToken: 'existing-access', refreshToken: 'existing-refresh' });
    expect(hydrateSession({ accessToken: 'new-access' })).toEqual({
      accessToken: 'new-access',
      refreshToken: 'existing-refresh',
    });
  });

  it('clears both tokens and remains safe to call more than once', () => {
    saveSession({ accessToken: 'access-value', refreshToken: 'refresh-value' });
    clearSession();
    clearSession();
    expect(readSession()).toEqual({ accessToken: null, refreshToken: null });
  });
});
