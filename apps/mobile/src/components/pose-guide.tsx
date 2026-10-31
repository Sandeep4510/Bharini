import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { PhotoSlot } from '@bharini/types';

/**
 * The pose each casting photo needs, as a line drawing (same paths as the web's pose-guides.tsx).
 * Used in empty photo slots and over the live camera so people can line themselves up.
 * Left profile = left cheek to the camera, so the nose points to the viewer's left.
 */
export function PoseGuide({ slot, color, strokeWidth = 2.5 }: { slot: PhotoSlot; color: string; strokeWidth?: number }) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg viewBox="0 0 120 160" width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M8 22V8h14M98 8h14v14M112 138v14H98M22 152H8v-14" {...stroke} opacity={0.4} />
      {slot === 'center' ? (
        <G>
          <Ellipse cx="60" cy="58" rx="20" ry="25" {...stroke} />
          <Path d="M51 54h4M65 54h4M60 58v8M54 72q6 4 12 0" {...stroke} opacity={0.7} />
          <Path d="M50 82v8M70 82v8M50 90q-28 6-34 40M70 90q28 6 34 40" {...stroke} />
        </G>
      ) : null}
      {slot === 'left' || slot === 'right' ? (
        <G transform={slot === 'right' ? 'translate(120 0) scale(-1 1)' : undefined}>
          <Path d="M66 33q-16-2-22 14l-2 10-6 7 6 3-2 6 3 3-1 5q2 6 10 6h6v8M66 33q16 4 16 26 0 14-8 22l-2 14" {...stroke} />
          <Circle cx="55" cy="52" r="1.5" fill={color} opacity={0.7} />
          <Path d="M60 95q-26 4-34 35M72 95q22 6 28 35" {...stroke} />
        </G>
      ) : null}
      {slot === 'full_length' ? (
        <G>
          <Circle cx="60" cy="28" r="10" {...stroke} />
          <Path d="M60 38v10M46 50h28l-3 42H49zM46 52l-10 34M74 52l10 34M52 92l-3 52M68 92l3 52M44 144h10M66 144h10" {...stroke} />
        </G>
      ) : null}
    </Svg>
  );
}
