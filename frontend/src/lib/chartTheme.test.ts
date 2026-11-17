import { afterEach, describe, expect, it } from 'vitest';
import { getChartThemeColors } from './chartTheme';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('getChartThemeColors', () => {
  it('falls back to the light theme when no CSS variables are defined', () => {
    const colors = getChartThemeColors();

    expect(colors.positive).toBe('rgb(34, 197, 94)');
    expect(colors.negative).toBe('rgb(239, 68, 68)');
    expect(colors.accentBlue).toBe('rgb(56, 104, 245)');
  });

  it('reads the --gemini-* variables so charts follow the active theme', () => {
    const root = document.documentElement;
    root.style.setProperty('--gemini-accent-green', '1 2 3');
    root.style.setProperty('--gemini-border', '10  20   30');
    root.style.setProperty('--gemini-text-secondary', '4 5 6');

    const colors = getChartThemeColors();

    expect(colors.positive).toBe('rgb(1, 2, 3)');
    expect(colors.volumeUp).toBe('rgba(1, 2, 3, 0.5)');
    expect(colors.borderColor).toBe('rgb(10, 20, 30)');
    expect(colors.gridColor).toBe('rgba(10, 20, 30, 0.45)');
    expect(colors.textColor).toBe('rgb(4, 5, 6)');
  });

  it('returns every key the charts read', () => {
    expect(Object.keys(getChartThemeColors()).sort()).toEqual(
      [
        'accentBlue',
        'accentOrange',
        'accentPurple',
        'background',
        'borderColor',
        'gridColor',
        'muted',
        'negative',
        'positive',
        'textColor',
        'volumeDown',
        'volumeUp',
      ].sort(),
    );
  });
});
