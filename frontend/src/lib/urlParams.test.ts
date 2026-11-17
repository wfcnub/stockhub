import { describe, expect, it } from 'vitest';
import { parseBooleanParam, parseBoundedInteger } from './urlParams';

describe('parseBoundedInteger', () => {
  it('returns the fallback for a missing or empty value instead of 0', () => {
    // Number(null) and Number('') are 0, which is valid for e.g. pivot_right_window (default 1).
    expect(parseBoundedInteger(null, 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger(undefined, 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger('', 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger('   ', 1, 0, 10)).toBe(1);
  });

  it('keeps an explicit 0 where 0 is in range', () => {
    expect(parseBoundedInteger('0', 1, 0, 10)).toBe(0);
    expect(parseBoundedInteger('0', 2, 0, 10)).toBe(0);
  });

  it('falls back when 0 is out of range', () => {
    expect(parseBoundedInteger('0', 5, 1, 20)).toBe(5);
    expect(parseBoundedInteger('0', 60, 30, 180)).toBe(60);
  });

  it('accepts values inside the range and rounds decimals', () => {
    expect(parseBoundedInteger('7', 1, 0, 10)).toBe(7);
    expect(parseBoundedInteger('10', 1, 0, 10)).toBe(10);
    expect(parseBoundedInteger('2.6', 1, 0, 10)).toBe(3);
  });

  it('falls back for out-of-range and non-numeric values', () => {
    expect(parseBoundedInteger('11', 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger('-1', 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger('abc', 1, 0, 10)).toBe(1);
    expect(parseBoundedInteger('Infinity', 1, 0, 10)).toBe(1);
  });
});

describe('parseBooleanParam', () => {
  it('returns the fallback when the value is missing or empty', () => {
    expect(parseBooleanParam(null)).toBe(false);
    expect(parseBooleanParam(null, true)).toBe(true);
    expect(parseBooleanParam('', true)).toBe(true);
  });

  it('reads 1/true/yes/on (any case) as true and other set values as false', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'On', ' on ']) {
      expect(parseBooleanParam(value, false)).toBe(true);
    }
    for (const value of ['0', 'false', 'no', 'off', 'banana']) {
      expect(parseBooleanParam(value, true)).toBe(false);
    }
  });
});
