import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, MediaSlot, PhotoSlot, ProfileOptions } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { ChipGroup, formStyles, SmallButton, TextField } from '@/components/form';
import { PoseGuide } from '@/components/pose-guide';
import { PostVideo } from '@/components/post-video';
import { openCamera } from '@/lib/camera';
import { fieldErrors, messageOf, toUpload } from '@/lib/config';

const PHOTO_SLOTS: { slot: PhotoSlot; title: string }[] = [
  { slot: 'center', title: 'Front' },
  { slot: 'left', title: 'Left profile' },
  { slot: 'right', title: 'Right profile' },
  { slot: 'full_length', title: 'Full length' },
];
const CASTING_PHOTO_DISCIPLINES = ['actor', 'choreographer']; // same rule as the web and the API
const PHOTO_MAX_MB = 8;
const SHOWREEL_LIMIT = 5;
const DOCUMENT_MAX_MB = 10;

type OnProfile = (profile: ArtistProfile) => void;

function lengthLabel(seconds: number) {
  return seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`;
}

/** One upload cell: what is there now, the ways to add or replace it, and remove. */
function Slot({ title, subtitle, filled, preview, actions, onRemove }: { title: string; subtitle: string; filled: boolean; preview: ReactNode; actions: { title: string; label: string; run: () => Promise<unknown> }[]; onRemove: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (caughtError) {
      // the API explains rejections, e.g. "This clip is 12.0 seconds long; the limit is 10 seconds."
      setError(fieldErrors(caughtError).file || messageOf(caughtError, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.slot, filled && styles.slotFilled]}>
      <View style={styles.slotHead}>
        <Text style={styles.slotTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.slotSub}>{subtitle}</Text>
      </View>
      {preview}
      <View style={styles.slotActions}>
        {actions.map((action) => (
          <View key={action.title} style={{ flex: 1 }}>
            <SmallButton title={busy ? '…' : action.title} label={`${action.label}: ${title}`} disabled={busy} onPress={() => void run(action.run)} />
          </View>
        ))}
        {filled ? <SmallButton title="🗑️" label={`Remove ${title}`} danger disabled={busy} onPress={() => void run(onRemove)} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function CastingPhotos({ profile, onProfile }: { profile: ArtistProfile; onProfile: OnProfile }) {

  const upload = async (slot: PhotoSlot, uri: string) => {
    const response = await apiClient.uploadPhoto(slot, toUpload({ uri }));
    if (response.data) onProfile(response.data);
  };

  return (
    <View style={formStyles.section}>
      <Text style={formStyles.sectionTitle}>Casting photos</Text>
      <Text style={formStyles.muted}>Line yourself up with the outline. Tap the shutter or press a volume button.</Text>
      <View style={styles.grid}>
        {PHOTO_SLOTS.map(({ slot, title }) => {
          const url = profile.photos[slot];
          return (
            <View key={slot} style={styles.half}>
              <Slot
                title={title}
                subtitle="Photo"
                filled={Boolean(url)}
                preview={<View style={styles.photoBox}>{url ? <Image source={url} style={StyleSheet.absoluteFill} contentFit="cover" /> : <PoseGuide slot={slot} color={colors.textMuted} />}</View>}
                actions={[
                  {
                    title: '📷',
                    label: 'Take photo',
                    run: async () => {
                      // the server face-checks casting photos: "Only you should be in this photo", "turn your head…"
                      const uri = await openCamera({ pose: slot, facing: slot === 'full_length' ? 'back' : 'front' });
                      if (uri) await upload(slot, uri);
                    },
                  },
                  {
                    title: '🖼️',
                    label: 'Choose from gallery',
                    run: async () => {
                      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
                      if (result.canceled) return;
                      if ((result.assets[0].fileSize ?? 0) > PHOTO_MAX_MB * 1024 * 1024) throw new Error(`Photo is too large (max ${PHOTO_MAX_MB} MB).`);
                      await upload(slot, result.assets[0].uri);
                    },
                  },
                ]}
                onRemove={async () => {
                  const response = await apiClient.deletePhoto(slot);
                  if (response.data) onProfile(response.data);
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MediaSlotCard({ discipline, slot, onProfile }: { discipline: string; slot: MediaSlot; onProfile: OnProfile }) {
  const upload = async (uri: string) => {
    const response = await apiClient.uploadMedia(discipline, slot.key, toUpload({ uri }));
    if (response.data) onProfile(response.data);
  };

  const checkVideo = (asset: ImagePicker.ImagePickerAsset) => {
    if ((asset.fileSize ?? 0) > slot.max_mb * 1024 * 1024) throw new Error(`File is too large (max ${slot.max_mb} MB).`);
    const seconds = (asset.duration ?? 0) / 1000;
    if (seconds > slot.max_seconds + 0.5) throw new Error(`This clip is ${seconds.toFixed(1)} sec; the limit is ${lengthLabel(slot.max_seconds)}.`);
  };

  const actions =
    slot.kind === 'audio'
      ? [
          {
            title: '🎵 Choose audio file',
            label: 'Choose audio file',
            run: async () => {
              const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
              if (result.canceled) return;
              if ((result.assets[0].size ?? 0) > slot.max_mb * 1024 * 1024) throw new Error(`File is too large (max ${slot.max_mb} MB).`);
              await upload(result.assets[0].uri);
            },
          },
        ]
      : slot.kind === 'image'
        ? [
            {
              title: '🖼️',
              label: 'Choose from gallery',
              run: async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
                if (!result.canceled) await upload(result.assets[0].uri);
              },
            },
          ]
        : [
            {
              title: '🎥',
              label: 'Record video',
              run: async () => {
                const permission = await ImagePicker.requestCameraPermissionsAsync();
                if (!permission.granted) throw new Error('Allow camera access in Settings to record.');
                // the system recorder stops by itself at the slot's limit
                const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: slot.max_seconds });
                if (result.canceled) return;
                checkVideo(result.assets[0]);
                await upload(result.assets[0].uri);
              },
            },
            {
              title: '🖼️',
              label: 'Choose video from gallery',
              run: async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
                if (result.canceled) return;
                checkVideo(result.assets[0]);
                await upload(result.assets[0].uri);
              },
            },
          ];

  const file = slot.file;
  const preview = !file ? (
    <View style={[styles.mediaEmpty, slot.kind === 'audio' && { height: 44 }]}>
      <Text style={styles.mediaIcon}>{slot.kind === 'audio' ? '🎵' : slot.kind === 'image' ? '📷' : '🎬'}</Text>
    </View>
  ) : slot.kind === 'video' ? (
    <PostVideo uri={file.url} />
  ) : slot.kind === 'image' ? (
    <Image source={file.url} style={styles.mediaImage} contentFit="cover" />
  ) : (
    <Text style={styles.audioDone}>🎵 Uploaded · {Math.round(file.duration_seconds)} sec</Text>
  );

  return (
    <Slot
      title={slot.label}
      subtitle={slot.kind === 'image' ? `max ${slot.max_mb} MB` : `max ${lengthLabel(slot.max_seconds)}`}
      filled={Boolean(file)}
      preview={preview}
      actions={actions}
      onRemove={async () => {
        const response = await apiClient.deleteMedia(discipline, slot.key);
        if (response.data) onProfile(response.data);
      }}
    />
  );
}

function ShowreelLinks({ profile, onProfile }: { profile: ArtistProfile; onProfile: OnProfile }) {
  const [links, setLinks] = useState<string[]>(profile.showreel_links.length ? profile.showreel_links : ['']);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiClient.updateProfile({ showreel_links: links.map((link) => link.trim()).filter(Boolean) });
      if (response.data) onProfile(response.data);
      setMessage('Saved.');
    } catch (caughtError) {
      setError(fieldErrors(caughtError).showreel_links || messageOf(caughtError, 'Could not save links.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={styles.subTitle}>Showreel links</Text>
      <Text style={formStyles.muted}>Your films and reels on YouTube, Vimeo or Google Drive (up to {SHOWREEL_LIMIT}).</Text>
      {links.map((link, index) => (
        <TextField key={index} value={link} onChangeText={(text) => setLinks((previous) => previous.map((item, i) => (i === index ? text : item)))} autoCapitalize="none" keyboardType="url" placeholder="https://youtube.com/…" />
      ))}
      <View style={styles.slotActions}>
        {links.length < SHOWREEL_LIMIT ? <SmallButton title="+ Add link" onPress={() => setLinks((previous) => [...previous, ''])} /> : null}
        <SmallButton title={busy ? 'Saving…' : 'Save links'} disabled={busy} onPress={() => void save()} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : message ? <Text style={styles.ok}>{message}</Text> : null}
    </View>
  );
}

function Documents({ profile, options, onProfile }: { profile: ArtistProfile; options: ProfileOptions; onProfile: OnProfile }) {
  const [kind, setKind] = useState(options.document_kinds[0]?.value ?? 'certificate');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    if (!title.trim()) return setError('Give the document a title.');
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
    if (result.canceled) return;
    if ((result.assets[0].size ?? 0) > DOCUMENT_MAX_MB * 1024 * 1024) return setError(`File is too large (max ${DOCUMENT_MAX_MB} MB).`);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.addDocument(kind, title.trim(), toUpload(result.assets[0]));
      if (response.data) onProfile(response.data);
      setTitle('');
    } catch (caughtError) {
      setError(Object.values(fieldErrors(caughtError))[0] || messageOf(caughtError, 'Could not add document.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      const response = await apiClient.deleteDocument(id);
      if (response.data) onProfile(response.data);
    } catch (caughtError) {
      setError(messageOf(caughtError, 'Could not remove document.'));
    }
  };

  return (
    <View style={formStyles.section}>
      <Text style={formStyles.sectionTitle}>Certificates & achievements</Text>
      <Text style={formStyles.muted}>Training certificates, awards, press mentions. PDF, JPG, PNG or WebP up to {DOCUMENT_MAX_MB} MB.</Text>
      {profile.documents.map((document) => (
        <View key={document.id} style={styles.docRow}>
          <Text style={styles.docTitle} numberOfLines={1} onPress={() => void Linking.openURL(document.file)}>
            {document.kind === 'achievement' ? '🏆' : '📜'} {document.title}
          </Text>
          <SmallButton title="🗑️" danger onPress={() => void remove(document.id)} />
        </View>
      ))}
      <ChipGroup options={options.document_kinds} value={[kind]} onChange={(next) => setKind(next.find((item) => item !== kind) ?? kind)} />
      <TextField value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Bharatanatyam diploma, Best Actor 2024" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={{ alignItems: 'flex-end' }}>
        <SmallButton title={busy ? 'Uploading…' : '📎 Choose file & upload'} disabled={busy} onPress={() => void upload()} />
      </View>
    </View>
  );
}

/** Step 4 (optional): everything casting teams look at. Each upload saves straight away, like the web. */
export function PortfolioStep({ profile, options, onProfile }: { profile: ArtistProfile; options: ProfileOptions; onProfile: OnProfile }) {
  const showCastingPhotos = profile.disciplines.some((discipline) => CASTING_PHOTO_DISCIPLINES.includes(discipline));
  return (
    <View style={{ gap: spacing.lg }}>
      {showCastingPhotos ? <CastingPhotos profile={profile} onProfile={onProfile} /> : null}
      {profile.media_slots.map((section) => (
        <View key={section.discipline} style={formStyles.section}>
          <Text style={formStyles.sectionTitle}>{section.label}</Text>
          <View style={styles.grid}>
            {section.slots.map((slot) => (
              <View key={slot.key} style={slot.kind === 'audio' ? styles.full : styles.half}>
                <MediaSlotCard discipline={section.discipline} slot={slot} onProfile={onProfile} />
              </View>
            ))}
          </View>
          {section.discipline === 'director' ? <ShowreelLinks profile={profile} onProfile={onProfile} /> : null}
        </View>
      ))}
      <Documents profile={profile} options={options} onProfile={onProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { width: '48.5%' },
  full: { width: '100%' },
  slot: { flex: 1, gap: spacing.sm, borderRadius: radius['2xl'], borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'rgba(2, 8, 23, 0.4)', padding: spacing.sm },
  slotFilled: { borderStyle: 'solid', borderColor: 'rgba(139, 92, 246, 0.4)', backgroundColor: colors.card },
  slotHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs },
  slotTitle: { flexShrink: 1, color: colors.textStrong, fontSize: fontSize.sm, fontWeight: '600' },
  slotSub: { color: colors.textMuted, fontSize: 11 },
  slotActions: { flexDirection: 'row', gap: spacing.xs },
  photoBox: { aspectRatio: 3 / 4, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: 'rgba(15, 23, 42, 0.6)' },
  mediaEmpty: { aspectRatio: 16 / 9, borderRadius: radius.xl, backgroundColor: 'rgba(15, 23, 42, 0.6)', alignItems: 'center', justifyContent: 'center' },
  mediaIcon: { fontSize: 28, opacity: 0.4 },
  mediaImage: { aspectRatio: 16 / 9, borderRadius: radius.xl },
  audioDone: { color: colors.text, fontSize: fontSize.sm, paddingVertical: spacing.sm },
  subTitle: { color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600', marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.xs },
  ok: { color: '#6ee7b7', fontSize: fontSize.xs },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  docTitle: { flex: 1, color: colors.text, fontSize: fontSize.sm },
});
