export type AuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
};

export const AUTH_STORAGE_KEYS = {
  accessToken: 'bharini.accessToken',
  refreshToken: 'bharini.refreshToken',
} as const;

export function readSession(): AuthSession {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null };
  }

  return {
    accessToken: window.localStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
    refreshToken: window.localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken),
  };
}

export function saveSession(session: Partial<AuthSession>) {
  if (typeof window === 'undefined') return;

  if (session.accessToken === null || session.accessToken === undefined) {
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  } else {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, session.accessToken);
  }

  if (session.refreshToken === null || session.refreshToken === undefined) {
    window.localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
  } else {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, session.refreshToken);
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
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
