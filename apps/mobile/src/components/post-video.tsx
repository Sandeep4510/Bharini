import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius } from '@bharini/theme';

/** Feed videos never autoplay: a tap mounts the player, so a long list does not open dozens of players. */
export function PostVideo({ uri }: { uri: string }) {
  const [active, setActive] = useState(false);
  if (!active) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Play video" onPress={() => setActive(true)} style={styles.poster}>
        <Text style={styles.play}>▶</Text>
      </Pressable>
    );
  }
  return <ActiveVideo uri={uri} />;
}

function ActiveVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (created) => created.play());
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  poster: { aspectRatio: 16 / 9, borderRadius: radius['2xl'], backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  play: { color: colors.textStrong, fontSize: 36 },
  video: { aspectRatio: 16 / 9, borderRadius: radius['2xl'], backgroundColor: '#000' },
});
