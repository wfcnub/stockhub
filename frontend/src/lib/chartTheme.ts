/**
 * Chart colours for Lightweight Charts, resolved from the CSS variables in `app/globals.css`
 * (`:root` for light, `.dark` for dark). Canvas charts cannot read CSS variables themselves, so every
 * chart effect calls `getChartThemeColors()` when it (re)builds, after the theme class has settled.
 *
 * Variables hold space-separated RGB channels (e.g. `56 104 245`), as used by Tailwind's
 * `rgb(var(--x) / <alpha-value>)` colours.
 */
export interface ChartThemeColors {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  positive: string;
  negative: string;
  muted: string;
  accentBlue: string;
  accentPurple: string;
  accentOrange: string;
  volumeUp: string;
  volumeDown: string;
}

// Light-theme values from `:root`, used during SSR and when a variable is missing.
const FALLBACK_CHANNELS = {
  bgPrimary: '243 247 253',
  border: '199 214 232',
  textSecondary: '72 88 113',
  textMuted: '126 145 171',
  accentBlue: '56 104 245',
  accentPurple: '94 114 176',
  accentOrange: '230 132 36',
  accentGreen: '34 197 94',
  accentRed: '239 68 68',
} as const;

function readChannels(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = styles?.getPropertyValue(name).trim();
  return value ? value : fallback;
}

function rgb(channels: string, alpha?: number): string {
  const normalized = channels.replace(/\s+/g, ' ').trim();
  return alpha === undefined ? `rgb(${normalized})` : `rgb(${normalized} / ${alpha})`;
}

export function getChartThemeColors(): ChartThemeColors {
  const styles = typeof window === 'undefined' ? null : window.getComputedStyle(document.documentElement);

  const border = readChannels(styles, '--gemini-border', FALLBACK_CHANNELS.border);
  const textSecondary = readChannels(styles, '--gemini-text-secondary', FALLBACK_CHANNELS.textSecondary);
  const textMuted = readChannels(styles, '--gemini-text-muted', FALLBACK_CHANNELS.textMuted);
  const accentBlue = readChannels(styles, '--gemini-accent-blue', FALLBACK_CHANNELS.accentBlue);
  const accentPurple = readChannels(styles, '--gemini-accent-purple', FALLBACK_CHANNELS.accentPurple);
  const accentOrange = readChannels(styles, '--gemini-accent-orange', FALLBACK_CHANNELS.accentOrange);
  const accentGreen = readChannels(styles, '--gemini-accent-green', FALLBACK_CHANNELS.accentGreen);
  const accentRed = readChannels(styles, '--gemini-accent-red', FALLBACK_CHANNELS.accentRed);

  return {
    background: 'rgba(0, 0, 0, 0)', // let the surrounding .hud-panel background show through
    textColor: rgb(textSecondary),
    gridColor: rgb(border, 0.45),
    borderColor: rgb(border),
    positive: rgb(accentGreen),
    negative: rgb(accentRed),
    muted: rgb(textMuted),
    accentBlue: rgb(accentBlue),
    accentPurple: rgb(accentPurple),
    accentOrange: rgb(accentOrange),
    volumeUp: rgb(accentGreen, 0.5),
    volumeDown: rgb(accentRed, 0.5),
  };
}
