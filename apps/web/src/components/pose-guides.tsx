import type { PhotoSlot } from '@bharini/types';

/**
 * Outline drawings of the pose each casting photo needs, shown in the empty slot.
 * Left profile = the left cheek faces the camera, so the nose points to the viewer's left.
 */
export function PoseGuide({ slot }: { slot: PhotoSlot }) {
  return (
    <svg viewBox="0 0 120 160" className="h-full w-full text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* framing corners, like a camera viewfinder */}
      <path d="M8 22V8h14M98 8h14v14M112 138v14H98M22 152H8v-14" className="opacity-40" />
      {slot === 'center' ? (
        <g>
          <ellipse cx="60" cy="58" rx="20" ry="25" />
          <path d="M51 54h4M65 54h4M60 58v8M54 72q6 4 12 0" className="opacity-70" />
          <path d="M50 82v8M70 82v8M50 90q-28 6-34 40M70 90q28 6 34 40" />
        </g>
      ) : null}
      {slot === 'left' || slot === 'right' ? (
        <g transform={slot === 'right' ? 'translate(120 0) scale(-1 1)' : undefined}>
          {/* side view facing the viewer's left: forehead, nose, lips, chin, back of head */}
          <path d="M66 33q-16-2-22 14l-2 10-6 7 6 3-2 6 3 3-1 5q2 6 10 6h6v8M66 33q16 4 16 26 0 14-8 22l-2 14" />
          <circle cx="55" cy="52" r="1.5" fill="currentColor" className="opacity-70" />
          <path d="M60 95q-26 4-34 35M72 95q22 6 28 35" />
        </g>
      ) : null}
      {slot === 'full_length' ? (
        <g>
          <circle cx="60" cy="28" r="10" />
          <path d="M60 38v10M46 50h28l-3 42H49zM46 52l-10 34M74 52l10 34M52 92l-3 52M68 92l3 52M44 144h10M66 144h10" />
        </g>
      ) : null}
    </svg>
  );
}
