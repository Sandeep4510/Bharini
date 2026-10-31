import * as Notifications from 'expo-notifications';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@bharini/theme';

import { AuthProvider, useAuth } from '@/lib/auth';
import { openFromNotification } from '@/lib/notifications';

void SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
};

const detailHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.textStrong,
  headerShadowVisible: false,
};

function RootStack() {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // a notification tapped while the app was closed or in the background
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !user || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    openFromNotification(response.notification.request.content.data);
    void Notifications.clearLastNotificationResponseAsync(); // handle each tap once
  }, [ready, user, response]);

  // keep the splash screen up until the saved session has been checked
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {/* "/" (index.tsx) picks Login or Home; the guards keep each side out of the other */}
      <Stack.Screen name="index" />
      <Stack.Protected guard={!user} redirectTo="/home">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user)} redirectTo="/login">
        <Stack.Screen name="(tabs)" />
        {/* pushed over the tabs, with a back button */}
        <Stack.Screen name="post/[id]" options={detailHeader} />
        <Stack.Screen name="user/[id]" options={detailHeader} />
        <Stack.Screen name="chat/[id]" options={detailHeader} />
        <Stack.Screen name="onboarding" options={detailHeader} />
        <Stack.Screen name="notification-settings" options={{ ...detailHeader, title: 'Notifications' }} />
        <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
