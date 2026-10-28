/** Line icons for the post action bar (24px grid, stroke follows the text colour). */
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export function HeartIcon({ filled = false, className = 'h-5 w-5' }: { filled?: boolean; className?: string }) {
  return (
    <svg {...base} className={`${className} ${filled ? 'fill-red-500 text-red-500' : ''}`}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

/** Speech bubble ("call out"). */
export function CommentIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

/** Paper plane. */
export function SendIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11Z" />
      <path d="m21.85 2.15-10.94 10.94" />
    </svg>
  );
}
