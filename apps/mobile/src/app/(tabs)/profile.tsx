import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@bharini/theme';

import { ProfileView } from '@/components/profile-view';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Your own profile as others see it, with Edit profile (artists) and Log out. */
export default function MyProfileScreen() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ProfileView
        userId={user.id}
        actions={() => (
          <View style={{ gap: spacing.sm }}>
            {user.role === 'artist' ? <Button title="Edit profile" onPress={() => router.push('/onboarding')} /> : null}
            <Button title="🔔 Notifications" variant="secondary" onPress={() => router.push('/notification-settings')} />
            <Button
              title="Log out"
              variant="secondary"
              busy={busy}
              onPress={() => {
                setBusy(true);
                void logout();
              }}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background } });
