import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors } from '@bharini/theme';

import { OtherProfileActions, ProfileView } from '@/components/profile-view';

/** Someone else's profile, opened from a post author or comment. */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ProfileView
        userId={Number(id)}
        actions={(profile, setProfile) => (profile.is_me ? null : <OtherProfileActions profile={profile} setProfile={setProfile} />)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background } });
