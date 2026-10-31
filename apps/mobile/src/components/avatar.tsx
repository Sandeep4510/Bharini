import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@bharini/theme';

/** Round profile photo, or the first letter of the name when there is no photo. */
export function Avatar({ name, photo, size = 40 }: { name: string; photo: string | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: radius.full };
  if (photo) return <Image source={photo} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: 'rgba(139, 92, 246, 0.3)', alignItems: 'center', justifyContent: 'center' },
  letter: { color: colors.accentSoft, fontWeight: '600' },
});
