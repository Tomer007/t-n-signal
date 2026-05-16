/**
 * Tests for Canonical Metrics — single source of truth.
 *
 * Regression tests for:
 * - Bug #2: EPS growth calculation (correct math + correct window)
 * - Bug #3: Duplicate dividend yield (ONE canonical value)
 * - Bug #4: Conflated EPS values (labeled, never mixed)
 */

import { describe, it, expect } from 'vitest';
import {
  computeEpsGrowth5y,
  computeEpsCagr,
  resolveCanonicalDividendYield,
  buildCanonicalMetrics,
  type EpsGrowthResult,
} from '../canonicalMetrics';
import type { VerifiedTickerData, EpsHistoryEntry } from '../market_data';
import { createEmptyTickerData } from '../market_data';

// ═══════════════════════════════════════════════════════════════
// Bug #2: EPS Growth Calculation
// ═══════════════════════════════════════════════════════════════

describe('computeEpsGrowth5y', () => {
  it('computes correct growth for MOS reference data', () => {
    // MOS verified data: 2021=$4.27, 2022=$10.06, 2023=$3.50, 2024=$0.55, 2025=$1.70
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2021', eps: 4.27 },
      { year: '2022', eps: 10.06 },
      { year: '2023', eps: 3.50 },
      { year: '2024', eps: 0.55 },
      { year: '2025', eps: 1.70 },
    ];

    const result = computeEpsGrowth5y(epsHistory);
    expect(result).not.toBeNull();
    expect(result!.startYear).toBe('2021');
    expect(result!.endYear).toBe('2025');
    expect(result!.startEps).toBe(4.27);
    expect(result!.endEps).toBe(1.70);
    // Growth = (1.70 - 4.27) / 4.27 × 100 = -60.19%
    expect(result!.growthPercent).toBeCloseTo(-60.19, 1);
    expect(result!.windowYears).toBe(4);
  });

  it('REGRESSION: does NOT compute -39.4% from $10.06 to $0.55 (bug #2 wrong math)', () => {
    // The old bug: used 2022→2024 window and computed (0.55-10.06)/10.06 = -94.5%
    // but displayed -39.4% (wrong formula). Our function uses the FULL window.
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2021', eps: 4.27 },
      { year: '2022', eps: 10.06 },
      { year: '2023', eps: 3.50 },
      { year: '2024', eps: 0.55 },
      { year: '2025', eps: 1.70 },
    ];

    const result = computeEpsGrowth5y(epsHistory);
    // Must NOT be -39.4% (the old buggy value)
    expect(result!.growthPercent).not.toBeCloseTo(-39.4, 0);
    // Must NOT ignore 2025 recovery
    expect(result!.endYear).toBe('2025');
    expect(result!.endEps).toBe(1.70);
  });

  it('uses full available window, not cherry-picked years', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2020', eps: 2.00 },
      { year: '2021', eps: 4.00 },
      { year: '2022', eps: 3.00 },
      { year: '2023', eps: 5.00 },
      { year: '2024', eps: 6.00 },
    ];

    const result = computeEpsGrowth5y(epsHistory);
    expect(result!.startYear).toBe('2020');
    expect(result!.endYear).toBe('2024');
    // Growth = (6.00 - 2.00) / 2.00 × 100 = 200%
    expect(result!.growthPercent).toBeCloseTo(200, 1);
  });

  it('returns null when start EPS is zero', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2020', eps: 0 },
      { year: '2024', eps: 5.00 },
    ];
    expect(computeEpsGrowth5y(epsHistory)).toBeNull();
  });

  it('returns null when start EPS is negative', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2020', eps: -1.50 },
      { year: '2024', eps: 2.00 },
    ];
    expect(computeEpsGrowth5y(epsHistory)).toBeNull();
  });

  it('returns null for empty or single-entry history', () => {
    expect(computeEpsGrowth5y([])).toBeNull();
    expect(computeEpsGrowth5y([{ year: '2024', eps: 5.0 }])).toBeNull();
  });

  it('handles unsorted input correctly', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2024', eps: 6.00 },
      { year: '2020', eps: 2.00 },
      { year: '2022', eps: 4.00 },
    ];

    const result = computeEpsGrowth5y(epsHistory);
    expect(result!.startYear).toBe('2020');
    expect(result!.endYear).toBe('2024');
    expect(result!.growthPercent).toBeCloseTo(200, 1);
  });
});

describe('computeEpsCagr', () => {
  it('computes CAGR correctly', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2020', eps: 2.00 },
      { year: '2024', eps: 4.00 },
    ];

    const result = computeEpsCagr(epsHistory);
    expect(result).not.toBeNull();
    // CAGR = (4/2)^(1/4) - 1 = 0.1892 = 18.92%
    expect(result!.growthPercent).toBeCloseTo(18.92, 1);
    expect(result!.method).toBe('cagr');
  });

  it('returns null when end EPS is negative', () => {
    const epsHistory: EpsHistoryEntry[] = [
      { year: '2020', eps: 2.00 },
      { year: '2024', eps: -1.00 },
    ];
    expect(computeEpsCagr(epsHistory)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #3: Duplicate Dividend Yield
// ═══════════════════════════════════════════════════════════════

describe('resolveCanonicalDividendYield', () => {
  it('REGRESSION: produces ONE canonical yield, not two different values (bug #3)', () => {
    // MOS data: $0.88/share, price ~$21.76
    // Computed: 0.88 / 21.76 = 4.04%
    // Reported: 3.88% (from provider)
    // Must pick ONE — computed wins (more accurate)
    const result = resolveCanonicalDividendYield(0.88, 21.76, 0.0388);
    expect(result.yield).toBeCloseTo(0.0404, 3); // 4.04%
    expect(result.source).toContain('computed');
  });

  it('prefers computed yield over reported yield', () => {
    const result = resolveCanonicalDividendYield(2.0, 50.0, 0.035);
    expect(result.yield).toBeCloseTo(0.04, 4); // 2.0/50.0 = 4%
    expect(result.source).toContain('computed');
  });

  it('falls back to reported yield when dividend_per_share is null', () => {
    const result = resolveCanonicalDividendYield(null, 50.0, 0.035);
    expect(result.yield).toBe(0.035);
    expect(result.source).toContain('reported');
  });

  it('falls back to reported yield when price is null', () => {
    const result = resolveCanonicalDividendYield(2.0, null, 0.035);
    expect(result.yield).toBe(0.035);
    expect(result.source).toContain('reported');
  });

  it('returns null when no data available', () => {
    const result = resolveCanonicalDividendYield(null, null, null);
    expect(result.yield).toBeNull();
    expect(result.source).toBe('unavailable');
  });

  it('handles zero dividend correctly', () => {
    const result = resolveCanonicalDividendYield(0, 50.0, 0);
    // Zero dividend per share → fall through to reported (which is also 0)
    expect(result.yield).toBe(0);
    expect(result.source).toContain('reported');
  });
});

// ═══════════════════════════════════════════════════════════════
// Bug #4: Conflated EPS Values
// ═══════════════════════════════════════════════════════════════

describe('buildCanonicalMetrics — EPS labeling', () => {
  it('REGRESSION: labels all EPS values distinctly (bug #4)', () => {
    const data = createEmptyTickerData('MOS', 'FMP');
    data.eps_ttm = 0.14;
    data.eps_history_5y = [
      { year: '2021', eps: 4.27 },
      { year: '2022', eps: 10.06 },
      { year: '2023', eps: 3.50 },
      { year: '2024', eps: 0.55 },
      { year: '2025', eps: 1.70 },
    ];
    data.price = 21.76;
    data.dividend_per_share = 0.88;
    data.dividend_yield = 0.0388;

    const metrics = buildCanonicalMetrics(data);

    // TTM is labeled
    expect(metrics.epsTTM).not.toBeNull();
    expect(metrics.epsTTM!.label).toBe('TTM');
    expect(metrics.epsTTM!.value).toBe(0.14);

    // Latest FY is labeled
    expect(metrics.epsLatestFY).not.toBeNull();
    expect(metrics.epsLatestFY!.label).toBe('FY2025');
    expect(metrics.epsLatestFY!.value).toBe(1.70);

    // All history entries are labeled
    expect(metrics.epsHistory.length).toBe(5);
    const labels = metrics.epsHistory.map(e => e.label);
    expect(labels).toContain('FY2021');
    expect(labels).toContain('FY2022');
    expect(labels).toContain('FY2023');
    expect(labels).toContain('FY2024');
    expect(labels).toContain('FY2025');

    // No two entries share the same label
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);
  });

  it('produces ONE canonical dividend yield', () => {
    const data = createEmptyTickerData('MOS', 'FMP');
    data.price = 21.76;
    data.dividend_per_share = 0.88;
    data.dividend_yield = 0.0388; // Different from computed!

    const metrics = buildCanonicalMetrics(data);

    // Only ONE yield value — computed from per-share/price
    expect(metrics.dividendYield).toBeCloseTo(0.0404, 3);
    expect(metrics.dividendYieldSource).toContain('computed');
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration: Full buildCanonicalMetrics
// ═══════════════════════════════════════════════════════════════

describe('buildCanonicalMetrics — full integration', () => {
  it('builds complete metrics from MOS reference data', () => {
    const data = createEmptyTickerData('MOS', 'FMP');
    data.price = 21.76;
    data.shares_outstanding = 317_510_000;
    data.eps_ttm = 0.14;
    data.eps_history_5y = [
      { year: '2021', eps: 4.27 },
      { year: '2022', eps: 10.06 },
      { year: '2023', eps: 3.50 },
      { year: '2024', eps: 0.55 },
      { year: '2025', eps: 1.70 },
    ];
    data.dividend_per_share = 0.88;
    data.dividend_yield = 0.0388;
    data.pe_trailing = 155.43;
    data.pb_ratio = 0.85;
    data.book_value_per_share = 25.60;
    data.total_debt = 5_760_000_000;
    data.current_ratio = 1.82;
    data.week_52_high = 38.23;
    data.week_52_low = 21.17;

    const metrics = buildCanonicalMetrics(data);

    expect(metrics.ticker).toBe('MOS');
    expect(metrics.price).toBe(21.76);
    expect(metrics.sharesOutstanding).toBe(317_510_000);
    expect(metrics.peTrailing).toBe(155.43);
    expect(metrics.pbRatio).toBe(0.85);
    expect(metrics.totalDebt).toBe(5_760_000_000);
    expect(metrics.currentRatio).toBe(1.82);
    expect(metrics.week52High).toBe(38.23);
    expect(metrics.week52Low).toBe(21.17);

    // EPS growth uses full window
    expect(metrics.epsGrowth5y).not.toBeNull();
    expect(metrics.epsGrowth5y!.startYear).toBe('2021');
    expect(metrics.epsGrowth5y!.endYear).toBe('2025');
  });

  it('handles null/missing data gracefully', () => {
    const data = createEmptyTickerData('UNKNOWN', 'Yahoo Finance');
    const metrics = buildCanonicalMetrics(data);

    expect(metrics.epsTTM).toBeNull();
    expect(metrics.epsLatestFY).toBeNull();
    expect(metrics.epsHistory).toHaveLength(0);
    expect(metrics.epsGrowth5y).toBeNull();
    expect(metrics.dividendYield).toBeNull();
    expect(metrics.price).toBeNull();
  });
});
