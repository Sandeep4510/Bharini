import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AUTH_STORAGE_KEYS, clearSession, saveSession, type AuthSession } from '@bharini/auth';
import { AuthProvider, useAuth } from '@/lib/auth';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    __mockValues: values,
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => values.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

jest.mock('@bharini/api-client', () => ({
  ...jest.requireActual('@bharini/api-client'),
  apiClient: {
    setSession: jest.fn(),
    clearSession: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  },
}));

jest.mock('@/lib/notifications', () => ({
  registerForPush: jest.fn().mockResolvedValue(null),
  unregisterForPush: jest.fn().mockResolvedValue(undefined),
}));

const mockApi = jest.requireMock('@bharini/api-client').apiClient as {
  setSession: jest.Mock;
  clearSession: jest.Mock;
  login: jest.Mock;
  logout: jest.Mock;
  me: jest.Mock;
};
const mockSecureValues = jest.requireMock('expo-secure-store').__mockValues as Map<string, string>;

function AuthProbe() {
  const auth = useAuth();
  return (
    <>
      <Text testID="state">{auth.ready ? auth.user?.id ?? 'signed-out' : 'loading'}</Text>
      <Pressable
        testID="login"
        onPress={() => void auth.login(' artist@example.com ', 'Password123!').catch(() => undefined)}
      >
        <Text>Log in</Text>
      </Pressable>
      <Pressable testID="logout" onPress={() => void auth.logout()}>
        <Text>Log out</Text>
      </Pressable>
    </>
  );
}

describe('mobile auth lifecycle', () => {
  beforeEach(() => {
    mockSecureValues.clear();
    jest.clearAllMocks();
    mockApi.setSession.mockImplementation((session: Partial<AuthSession>) => saveSession(session));
    mockApi.clearSession.mockImplementation(() => clearSession());
    mockApi.me.mockResolvedValue({ data: null });
  });

  it('starts ready without stored tokens and does not request the account', async () => {
    await render(<AuthProvider><AuthProbe /></AuthProvider>);
    expect(screen.getByTestId('state').props.children).toBe('signed-out');
    expect(mockApi.me).not.toHaveBeenCalled();
  });

  it('persists tokens only after login returns both tokens and a user', async () => {
    const user = { id: 7 };
    mockApi.login.mockResolvedValue({
      message: 'Welcome',
      data: { user, tokens: { access: 'access-value', refresh: 'refresh-value' } },
    });
    await render(<AuthProvider><AuthProbe /></AuthProvider>);

    await fireEvent.press(screen.getByTestId('login'));

    await waitFor(() => expect(screen.getByTestId('state').props.children).toBe(7));
    expect(mockApi.setSession).toHaveBeenCalledWith({
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
    });
    expect(mockSecureValues.get(AUTH_STORAGE_KEYS.accessToken)).toBe('access-value');
    expect(mockSecureValues.get(AUTH_STORAGE_KEYS.refreshToken)).toBe('refresh-value');
  });

  it('does not establish an authenticated state from an incomplete login response', async () => {
    mockApi.login.mockResolvedValue({
      message: 'Malformed response',
      data: { user: { id: 7 }, tokens: { access: '', refresh: 'refresh-value' } },
    });
    await render(<AuthProvider><AuthProbe /></AuthProvider>);

    await fireEvent.press(screen.getByTestId('login'));
    await waitFor(() => expect(mockApi.login).toHaveBeenCalled());

    expect(screen.getByTestId('state').props.children).toBe('signed-out');
    expect(mockApi.setSession).not.toHaveBeenCalled();
  });

  it('clears local credentials and user even when the server logout call fails offline', async () => {
    mockApi.login.mockResolvedValue({
      data: { user: { id: 7 }, tokens: { access: 'access-value', refresh: 'refresh-value' } },
    });
    mockApi.logout.mockRejectedValue(new Error('offline'));
    await render(<AuthProvider><AuthProbe /></AuthProvider>);

    await fireEvent.press(screen.getByTestId('login'));
    await waitFor(() => expect(screen.getByTestId('state').props.children).toBe(7));
    await fireEvent.press(screen.getByTestId('logout'));

    await waitFor(() => expect(screen.getByTestId('state').props.children).toBe('signed-out'));
    expect(mockApi.clearSession).toHaveBeenCalled();
    expect(mockSecureValues.size).toBe(0);
  });

  it('clears an invalid stored session after the server returns unauthorized', async () => {
    mockSecureValues.set(AUTH_STORAGE_KEYS.accessToken, 'expired-access');
    mockSecureValues.set(AUTH_STORAGE_KEYS.refreshToken, 'expired-refresh');
    const { ApiError } = jest.requireActual('@bharini/api-client');
    mockApi.me.mockRejectedValue(new ApiError('unauthorized', {}, 401));

    await render(<AuthProvider><AuthProbe /></AuthProvider>);

    await waitFor(() => expect(mockApi.clearSession).toHaveBeenCalled());
    expect(mockSecureValues.size).toBe(0);
    expect(screen.getByTestId('state').props.children).toBe('signed-out');
  });
});
