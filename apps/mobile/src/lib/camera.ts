import { router } from 'expo-router';

import type { PhotoSlot } from '@bharini/types';

let pending: ((uri: string | null) => void) | null = null;

/**
 * Opens the full-screen camera route and resolves with the photo's file uri, or null if closed without one.
 * The camera is a route rather than a Modal because Android only delivers volume-key presses to the app's main
 * window, and the volume buttons work as the shutter.
 */
export function openCamera(options: { pose?: PhotoSlot; facing?: 'front' | 'back' } = {}): Promise<string | null> {
  pending?.(null); // a camera already waiting is superseded
  return new Promise((resolve) => {
    pending = resolve;
    router.push({ pathname: '/camera', params: { pose: options.pose ?? '', facing: options.facing ?? 'back' } });
  });
}

/** Called by the camera screen when it closes. */
export function finishCamera(uri: string | null) {
  const resolve = pending;
  pending = null;
  resolve?.(uri);
}
