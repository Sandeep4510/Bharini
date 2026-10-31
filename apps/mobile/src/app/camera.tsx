import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import type { PhotoSlot } from '@bharini/types';

import { CameraCapture } from '@/components/camera-capture';
import { finishCamera } from '@/lib/camera';

/** Full-screen camera route opened by openCamera(); it hands the photo back and closes. */
export default function CameraScreen() {
  const { pose, facing } = useLocalSearchParams<{ pose?: string; facing?: string }>();

  // leaving by the system back gesture counts as closing without a photo
  useEffect(() => () => finishCamera(null), []);

  return (
    <CameraCapture
      pose={pose ? (pose as PhotoSlot) : undefined}
      initialFacing={facing === 'front' ? 'front' : 'back'}
      onCapture={(uri) => {
        finishCamera(uri);
        router.back();
      }}
      onClose={() => router.back()}
    />
  );
}
