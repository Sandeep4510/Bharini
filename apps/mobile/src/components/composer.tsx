import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Button, ErrorBanner } from '@/components/ui';
import { toUpload } from '@/lib/config';

const BODY_LIMIT = 5000;
const VIDEO_MAX_MB = 100; // the API's limit for post videos

/** "Share something": text plus an optional photo or video from the gallery, posted to the same /posts/ API as the web. */
export function Composer({ onPosted }: { onPosted: (post: ArtistPost) => void }) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.type === 'video' && (asset.fileSize ?? 0) > VIDEO_MAX_MB * 1024 * 1024) {
      return setError(`Video is too large (max ${VIDEO_MAX_MB} MB).`);
    }
    setError('');
    setMedia(asset);
  };

  const submit = async () => {
    if (!body.trim()) return setError('Write something to post.');
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.createPost(body.trim(), media ? toUpload(media) : null);
      if (response.data) onPosted(response.data);
      setBody('');
      setMedia(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not post.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <ErrorBanner message={error} />
      <TextInput
        value={body}
        onChangeText={setBody}
        maxLength={BODY_LIMIT}
        multiline
        placeholder="Share something: a new role, a workshop, a performance…"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel="Write a post"
      />
      {media ? (
        <View style={styles.attachment}>
          {media.type === 'video' ? <Text style={styles.videoTag}>🎬 Video attached</Text> : <Image source={media.uri} style={styles.thumb} contentFit="cover" />}
          <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={() => setMedia(null)} hitSlop={8}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => void pick()} style={styles.attach}>
          <Text style={styles.attachText}>🖼️ Photo / video</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button title="Post" busy={busy} onPress={() => void submit()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderRadius: radius['3xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  input: { minHeight: 80, maxHeight: 200, color: colors.textStrong, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, padding: spacing.md, textAlignVertical: 'top' },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radius.xl },
  videoTag: { color: colors.text, fontSize: fontSize.sm },
  remove: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  attach: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 14 },
  attachText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
});
