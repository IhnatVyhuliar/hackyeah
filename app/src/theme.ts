// Sellsor design tokens (dark-first). Values mirror ds/tokens/colors.css.
export const C: Record<string, string> = {
  '--ink-950': '#050507', '--ink-900': '#0B0B0F', '--ink-850': '#111116', '--ink-800': '#14141A', '--ink-750': '#1B1B22', '--ink-700': '#1E1E26',
  '--ink-600': '#2A2A35', '--ink-500': '#4A4A57', '--ink-400': '#6B6B78', '--ink-300': '#9A9AA6', '--ink-200': '#C9C9D2', '--ink-100': '#F4F4F6',
  '--purple-500': '#9945FF', '--purple-400': '#B98AFF', '--purple-600': '#7A2FE0',
  '--mint-500': '#14F195', '--mint-400': '#5CF7B8', '--mint-600': '#0FC97C',
  '--amber-500': '#FFB547', '--amber-tint': 'rgba(255,181,71,0.12)', '--red-500': '#FF6B6B',
};
Object.assign(C, {
  '--bg-app': C['--ink-950'], '--bg-screen': C['--ink-900'], '--surface-1': C['--ink-800'], '--surface-2': C['--ink-750'], '--surface-press': C['--ink-700'],
  '--line': C['--ink-700'], '--line-strong': C['--ink-600'], '--fg-1': C['--ink-100'], '--fg-2': C['--ink-200'], '--fg-3': C['--ink-400'], '--fg-disabled': C['--ink-500'],
  '--accent': C['--purple-500'], '--accent-press': C['--purple-600'], '--secured': C['--mint-500'], '--success': C['--mint-500'],
  '--warning': C['--amber-500'], '--danger': C['--red-500'], '--info': C['--purple-400'], '--scrim': 'rgba(5,5,7,0.72)',
});

// View models carry CSS-var strings ('var(--fg-1)'); resolve them to hex for RN.
export const col = (x?: string): string | undefined => {
  if (!x) return undefined;
  const m = x.match(/^var\((--[a-z0-9-]+)\)$/);
  return m ? C[m[1]] : x;
};

export const F = {
  sans: { 400: 'SpaceGrotesk_400Regular', 500: 'SpaceGrotesk_500Medium', 600: 'SpaceGrotesk_600SemiBold', 700: 'SpaceGrotesk_700Bold' } as Record<number, string>,
  mono: { 400: 'JetBrainsMono_400Regular', 500: 'JetBrainsMono_500Medium', 600: 'JetBrainsMono_600SemiBold', 700: 'JetBrainsMono_700Bold' } as Record<number, string>,
};
export const PH = '#6B6B78';
export const LINE = C['--line'];
export const LINE_STRONG = C['--line-strong'];
