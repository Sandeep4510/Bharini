import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VolumeManager } from 'react-native-volume-manager';

import type { PhotoSlot } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { PoseGuide } from '@/components/pose-guide';
import { Button } from '@/components/ui';

const POSE_TIPS: Record<PhotoSlot, string> = {
  center: 'Face the camera, neutral expression, plain background',
  left: 'Turn your head fully to show your left side',
  right: 'Turn your head fully to show your right side',
  full_length: 'Head to toe, standing straight, fitted clothes',
};
// mid-level volume so both volume keys always report a change (iOS sends nothing at max or min)
const SHUTTER_VOLUME = 0.5;

/**
 * Full-screen camera for profile and casting photos, shown by the /camera route (see lib/camera.ts).
 * The pose outline sits over the preview, and either volume
 * button takes the picture, like the phone's own camera app. Volume and the system volume UI are put back on close.
 */
export function CameraCapture({
  pose,
  initialFacing = 'back',
  onCapture,
  onClose,
}: {
  pose?: PhotoSlot;
  initialFacing?: CameraType;
  onCapture: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>(initialFacing);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const camera = useRef<CameraView>(null);
  const busyRef = useRef(false);

  const capture = async () => {
    if (!camera.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.85 });
      if (picture?.uri) onCapture(picture.uri);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  // the volume listener lives for the whole camera session but must always call the latest capture
  const onVolumeKey = useEffectEvent(() => void capture());

  // volume buttons as the shutter while the camera is open
  useEffect(() => {
    if (!ready) return;
    let original: number | null = null;
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;
    void (async () => {
      original = (await VolumeManager.getVolume()).volume;
      await VolumeManager.showNativeVolumeUI({ enabled: false });
      await VolumeManager.setVolume(SHUTTER_VOLUME, { showUI: false });
      if (cancelled) return;
      subscription = VolumeManager.addVolumeListener((result) => {
        if (Math.abs(result.volume - SHUTTER_VOLUME) < 0.01) return; // our own reset, not a key press
        void VolumeManager.setVolume(SHUTTER_VOLUME, { showUI: false });
        onVolumeKey();
      });
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
      void VolumeManager.showNativeVolumeUI({ enabled: true });
      if (original !== null) void VolumeManager.setVolume(original, { showUI: false });
    };
  }, [ready]);

  return (
    <View style={styles.screen}>
        {!permission ? null : !permission.granted ? (
          <SafeAreaView style={styles.permission}>
            <Text style={styles.title}>Camera access</Text>
            <Text style={styles.text}>Bharini needs the camera to take your profile and casting photos. Photos are only used for your profile.</Text>
            {permission.canAskAgain ? (
              <Button title="Allow camera" onPress={() => void requestPermission()} />
            ) : (
              <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
            )}
            <Button title="Not now" variant="secondary" onPress={onClose} />
          </SafeAreaView>
        ) : (
          <>
            <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} mode="picture" mirror={facing === 'front'} onCameraReady={() => setReady(true)} />
            {pose ? (
              <View pointerEvents="none" style={styles.guide}>
                <PoseGuide slot={pose} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              </View>
            ) : null}
            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
              <View style={styles.top}>
                <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} hitSlop={12}>
                  <Text style={styles.icon}>✕</Text>
                </Pressable>
                {pose ? <Text style={styles.tip}>{POSE_TIPS[pose]}</Text> : <View style={{ flex: 1 }} />}
              </View>
              <View style={styles.bottom}>
                <Text style={styles.hint}>Tap the button or press a volume key</Text>
                <View style={styles.controls}>
                  <View style={{ width: 56 }} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Take photo"
                    disabled={!ready || busy}
                    onPress={() => void capture()}
                    style={[styles.shutter, (!ready || busy) && { opacity: 0.5 }]}
                  >
                    <View style={styles.shutterInner} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Switch camera"
                    onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
                    style={styles.flip}
                  >
                    <Text style={styles.icon}>⟲</Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  permission: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.background },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  text: { color: colors.text, fontSize: fontSize.base, lineHeight: 22 },
  guide: { position: 'absolute', top: '12%', bottom: '18%', left: '8%', right: '8%' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  tip: { flex: 1, color: colors.textStrong, fontSize: fontSize.sm, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  icon: { color: colors.textStrong, fontSize: 28 },
  bottom: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.xl },
  hint: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', alignSelf: 'stretch' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.textStrong, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.textStrong },
  flip: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
