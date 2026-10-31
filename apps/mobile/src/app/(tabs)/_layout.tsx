import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import { colors } from '@bharini/theme';

import { useAuth } from '@/lib/auth';

// shortcut: polled like the web header badge; push notifications (slice 4) will update it instantly
const UNREAD_POLL_MS = 15000;

export default function TabsLayout() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      apiClient
        .getUnreadMessageCount()
        .then((response) => {
          if (!cancelled) setUnread(response.data?.unread ?? 0);
        })
        .catch(() => undefined); // the badge is a hint; skip a failed check
    void check();
    const timer = setInterval(() => void check(), UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // artists finish the required profile steps before using the app, like the web
  if (user?.role === 'artist' && !user.onboarding_complete) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs
      backgroundColor={colors.card}
      tintColor={colors.accent}
      iconColor={{ default: colors.textMuted, selected: colors.accentSoft }}
      labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.textStrong } }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home_filled' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages">
        <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
        {unread ? <NativeTabs.Trigger.Badge>{unread > 99 ? '99+' : String(unread)}</NativeTabs.Trigger.Badge> : null}
        <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} md="chat" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
