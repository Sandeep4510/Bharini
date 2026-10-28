export type AuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
};

export const AUTH_STORAGE_KEYS = {
  accessToken: 'bharini.accessToken',
  refreshToken: 'bharini.refreshToken',
} as const;

/** Synchronous key/value store for tokens: localStorage on the web, SecureStore on mobile. */
export type SessionStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const noStorage: SessionStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

let custom: SessionStorage | null = null;

/** React Native has no localStorage, so the app registers its own store here before the first API call. */
export function setSessionStorage(next: SessionStorage) {
  custom = next;
}

// resolved per call: on the server (SSR) there is no browser window, so there are no tokens
function store(): SessionStorage {
  if (custom) return custom;
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : noStorage;
}

export function readSession(): AuthSession {
  const storage = store();
  return {
    // '' counts as no token: mobile blanks a key before its async delete finishes
    accessToken: storage.getItem(AUTH_STORAGE_KEYS.accessToken) || null,
    refreshToken: storage.getItem(AUTH_STORAGE_KEYS.refreshToken) || null,
  };
}

export function saveSession(session: Partial<AuthSession>) {
  const storage = store();
  if (session.accessToken === null || session.accessToken === undefined) {
    storage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  } else {
    storage.setItem(AUTH_STORAGE_KEYS.accessToken, session.accessToken);
  }

  if (session.refreshToken === null || session.refreshToken === undefined) {
    storage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
  } else {
    storage.setItem(AUTH_STORAGE_KEYS.refreshToken, session.refreshToken);
  }
}

export function clearSession() {
  const storage = store();
  storage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  storage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
}

export function isAuthenticated() {
  return Boolean(readSession().accessToken);
}

export function hydrateSession(tokens?: Partial<AuthSession> | null): AuthSession {
  const current = readSession();
  const session = {
    accessToken: tokens?.accessToken ?? current.accessToken,
    refreshToken: tokens?.refreshToken ?? current.refreshToken,
  };

  saveSession(session);
  return session;
}
