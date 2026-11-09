jest.mock('expo-constants', () => ({ __esModule: true, default: {} }));
jest.mock('expo-notifications', () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@bharini/api-client', () => ({
  apiClient: { registerPushDevice: jest.fn(), unregisterPushDevice: jest.fn() },
}));
jest.mock('@bharini/theme', () => ({ colors: { accent: '#8b5cf6' } }));

import { router } from 'expo-router';

import { openFromNotification, registerForPush } from '@/lib/notifications';

describe('push notification handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not request or register a push token when permission is denied', async () => {
    const Notifications = jest.requireMock('expo-notifications');
    await expect(registerForPush()).resolves.toBeNull();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('ignores absent, unknown, and malformed notification payloads', () => {
    openFromNotification(undefined);
    openFromNotification({ kind: 'unknown', user_id: '123' });
    openFromNotification({ kind: 'messages' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('routes supported notification types to internal app routes only', () => {
    openFromNotification({ kind: 'messages', conversation_id: 42 });
    openFromNotification({ kind: 'connections', user_id: 'artist-42' });
    openFromNotification({ kind: 'casting' });

    expect(router.push).toHaveBeenNthCalledWith(1, {
      pathname: '/chat/[id]',
      params: { id: '42' },
    });
    expect(router.push).toHaveBeenNthCalledWith(2, {
      pathname: '/user/[id]',
      params: { id: 'artist-42' },
    });
    expect(router.push).toHaveBeenNthCalledWith(3, '/home');
  });

  it.each([
    { kind: 'messages', conversation_id: '../admin' },
    { kind: 'messages', conversation_id: 'https://example.test' },
    { kind: 'connections', user_id: { id: 1 } },
    { kind: 'follows', user_id: -1 },
  ])('does not route malformed or path-like notification identifiers', (payload) => {
    openFromNotification(payload);
    expect(router.push).not.toHaveBeenCalled();
  });
});
