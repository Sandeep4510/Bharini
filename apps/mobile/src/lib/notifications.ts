import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { apiClient } from '@bharini/api-client';
import { colors } from '@bharini/theme';

// must match backend notifications/push.py ANDROID_CHANNEL; Android drops pushes for unknown channels
const CHANNEL = 'default';

// show pushes as banners even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken: string | null = null;

/**
 * Asks for permission, gets this phone's Expo push token and registers it with the backend.
 * Never throws: without permission, an EAS project id or Firebase setup the app simply gets no pushes.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      // Android 13+ only shows the permission prompt once a channel exists
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Bharini',
        importance: AndroidImportance.HIGH,
        lightColor: colors.accent,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('Push disabled: no EAS projectId in app.json (run `eas init`).');
      return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await apiClient.registerPushDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
    return token;
  } catch (error) {
    console.warn('Push registration failed', error);
    return null;
  }
}

/** On logout: stop pushes for this account on this phone. Must run while still signed in. */
export async function unregisterForPush() {
  if (!registeredToken) return;
  await apiClient.unregisterPushDevice(registeredToken).catch(() => undefined);
  registeredToken = null;
}

/** Where a tapped notification leads, from the `data` the backend puts in each push. */
export function openFromNotification(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (data.kind === 'messages' && data.conversation_id) {
    router.push({ pathname: '/chat/[id]', params: { id: String(data.conversation_id) } });
  } else if ((data.kind === 'connections' || data.kind === 'follows') && data.user_id) {
    router.push({ pathname: '/user/[id]', params: { id: String(data.user_id) } });
  } else if (data.kind === 'casting') {
    router.push('/home');
  }
}
