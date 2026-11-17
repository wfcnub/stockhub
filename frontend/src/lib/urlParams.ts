/**
 * Parsers for numeric/boolean values read from the URL query string.
 *
 * A missing (`null`) or empty value is "not set" and always yields the fallback. `Number(null)` and
 * `Number('')` are 0, so parsing without this check silently turns "not set" into 0, which is a valid
 * value for several parameters (e.g. triangle `pivot_right_window`, whose contract default is 1).
 */

function isBlank(value: string | null | undefined): value is null | undefined | '' {
  return value === null || value === undefined || value.trim() === '';
}

/** Integer within [minimum, maximum]; missing, non-numeric or out-of-range values yield `fallback`. */
export function parseBoundedInteger(
  value: string | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (isBlank(value)) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  if (rounded < minimum || rounded > maximum) {
    return fallback;
  }

  return rounded;
}

/** `1/true/yes/on` are true, anything else that is set is false; missing or empty yields `fallback`. */
export function parseBooleanParam(value: string | null | undefined, fallback = false): boolean {
  if (isBlank(value)) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
