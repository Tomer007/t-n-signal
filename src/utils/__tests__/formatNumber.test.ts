/**
 * Tests for Number Formatting Utilities — Bug #8.
 */

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatRatio,
  formatPercent,
  formatMarketCap,
  formatShares,
  isProperlyFormatted,
} from '../formatNumber';

describe('formatRatio', () => {
  it('formatRatio(155.42857) -> "155.43"', () => {
    expect(formatRatio(155.42857)).toBe('155.43');
  });

  it('formatRatio(0.797) -> "0.80"', () => {
    expect(formatRatio(0.797)).toBe('0.80');
  });

  it('formatRatio(11) -> "11.00"', () => {
    expect(formatRatio(11)).toBe('11.00');
  });

  it('formatRatio(null) -> "N/A"', () => {
    expect(formatRatio(null)).toBe('N/A');
  });
});

describe('formatMarketCap', () => {
  it('formatMarketCap(6916343296) -> "$6.92B"', () => {
    expect(formatMarketCap(6916343296)).toBe('$6.92B');
  });

  it('formatMarketCap(-289790000) -> "-$289.79M"', () => {
    expect(formatMarketCap(-289790000)).toBe('-$289.79M');
  });

  it('formatMarketCap(5760000000) -> "$5.76B"', () => {
    expect(formatMarketCap(5760000000)).toBe('$5.76B');
  });

  it('formatMarketCap(1500000) -> "$1.50M"', () => {
    expect(formatMarketCap(1500000)).toBe('$1.50M');
  });

  it('formatMarketCap(null) -> "N/A"', () => {
    expect(formatMarketCap(null)).toBe('N/A');
  });

  it('formatMarketCap(2500000000000) -> "$2.50T"', () => {
    expect(formatMarketCap(2500000000000)).toBe('$2.50T');
  });
});

describe('formatCurrency', () => {
  it('formatCurrency(21.76) -> "$21.76"', () => {
    expect(formatCurrency(21.76)).toBe('$21.76');
  });

  it('formatCurrency(-289.79) -> "-$289.79"', () => {
    expect(formatCurrency(-289.79)).toBe('-$289.79');
  });

  it('formatCurrency(null) -> "N/A"', () => {
    expect(formatCurrency(null)).toBe('N/A');
  });
});

describe('formatPercent', () => {
  it('formatPercent(3.88) -> "3.88%"', () => {
    expect(formatPercent(3.88)).toBe('3.88%');
  });

  it('formatPercent(0.0388, 2, true) -> "3.88%" (decimal input)', () => {
    expect(formatPercent(0.0388, 2, true)).toBe('3.88%');
  });

  it('formatPercent(-94.53) -> "-94.53%"', () => {
    expect(formatPercent(-94.53)).toBe('-94.53%');
  });

  it('formatPercent(null) -> "N/A"', () => {
    expect(formatPercent(null)).toBe('N/A');
  });
});

describe('formatShares', () => {
  it('formatShares(317510000) -> "317.51M"', () => {
    expect(formatShares(317510000)).toBe('317.51M');
  });

  it('formatShares(null) -> "N/A"', () => {
    expect(formatShares(null)).toBe('N/A');
  });
});

describe('isProperlyFormatted', () => {
  it('rejects raw float "155.42857"', () => {
    expect(isProperlyFormatted('P/E: 155.42857')).toBe(false);
  });

  it('rejects raw large integer "6916343296"', () => {
    expect(isProperlyFormatted('Market Cap: 6916343296')).toBe(false);
  });

  it('accepts formatted "$6.92B"', () => {
    expect(isProperlyFormatted('Market Cap: $6.92B')).toBe(true);
  });

  it('accepts formatted "155.43"', () => {
    expect(isProperlyFormatted('P/E: 155.43')).toBe(true);
  });

  it('accepts formatted "3.88%"', () => {
    expect(isProperlyFormatted('Yield: 3.88%')).toBe(true);
  });

  it('accepts "$21.76"', () => {
    expect(isProperlyFormatted('Price: $21.76')).toBe(true);
  });
});
