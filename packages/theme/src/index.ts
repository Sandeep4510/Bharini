/**
 * Bharini design tokens: the dark slate + violet look of the web app (Tailwind slate / violet scales).
 * Mobile styles read these directly; the web uses the same values through Tailwind classes.
 */
export const colors = {
  background: '#020817',
  card: '#0f172a', // slate-900
  cardMuted: '#1e293b', // slate-800
  border: '#1e293b', // slate-800
  borderStrong: '#334155', // slate-700
  text: '#e2e8f0', // slate-200
  textStrong: '#ffffff',
  textMuted: '#94a3b8', // slate-400
  accent: '#8b5cf6', // violet-500
  accentHover: '#a78bfa', // violet-400
  accentSoft: '#c4b5fd', // violet-300
  danger: '#fca5a5', // red-300
  dangerBg: 'rgba(239, 68, 68, 0.1)',
  like: '#ef4444', // red-500
} as const;

export const radius = { md: 8, xl: 12, '2xl': 16, '3xl': 24, full: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;

export const fontSize = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30 } as const;
