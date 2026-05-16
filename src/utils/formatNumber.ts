/**
 * Number Formatting Utilities — Bug #8 fix.
 *
 * RULE: Every number rendered in a report MUST go through one of these
 * formatters. No raw floats (no "155.42857"), no raw integers (no "6,916,343,296").
 */

/**
 * Format a currency value (e.g. $21.76, -$289.79M)
 * For absolute values, use formatMarketCap for large numbers.
 */
export function formatCurrency(value: number | null, decimals: number = 2): string {
  if (value === null) return 'N/A';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

/**
 * Format a ratio to max 2 decimal places (e.g. 155.43, 0.80)
 * Never shows more than 2 decimals.
 */
export function formatRatio(value: number | null, decimals: number = 2): string {
  if (value === null) return 'N/A';
  return value.toFixed(decimals);
}

/**
 * Format a percentage (e.g. "3.88%", "-94.53%")
 * Input is the raw decimal (0.0388) or already a percentage (3.88).
 * Use `isDecimal` to indicate if input is 0-1 range.
 */
export function formatPercent(value: number | null, decimals: number = 2, isDecimal: boolean = false): string {
  if (value === null) return 'N/A';
  const pct = isDecimal ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Format large numbers with B/M/K suffixes (e.g. "$6.92B", "$289.79M")
 */
export function formatMarketCap(value: number | null): string {
  if (value === null) return 'N/A';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs >= 1e12) {
    return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  } else if (abs >= 1e9) {
    return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  } else if (abs >= 1e6) {
    return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  } else if (abs >= 1e3) {
    return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

/**
 * Format shares outstanding (e.g. "317.51M")
 */
export function formatShares(value: number | null): string {
  if (value === null) return 'N/A';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toString();
}

/**
 * Validate that a rendered number string is properly formatted.
 * Returns true if the number has <= 2 decimal places and no raw large integers.
 * Used by the report validator to catch Bug #8.
 */
export function isProperlyFormatted(rendered: string): boolean {
  // Check for raw floats with more than 2 decimal places
  const rawFloat = /\d+\.\d{3,}/.test(rendered);
  if (rawFloat) return false;

  // Check for raw integers > 7 digits without formatting
  const rawLargeInt = /(?<!\$)\b\d{8,}\b/.test(rendered);
  if (rawLargeInt) return false;

  return true;
}
